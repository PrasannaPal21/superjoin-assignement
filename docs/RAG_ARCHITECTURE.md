# Classical Hybrid RAG — System Architecture

Architecture label: **Classical Hybrid RAG** on a grounded fact knowledge layer.

- **Classical:** retrieve → rerank → generate / classify (no agent loops)
- **Hybrid:** lexical / `match_key` / BM25 **+** dense embeddings, fused with RRF
- **Extras:** parent–child chunking, modular stages, HITL on low-confidence conflicts
- **Not:** GraphRAG, Agentic / Self / Corrective RAG, HyDE, Adaptive, Multimodal RAG

Runtime wiring: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. System context

```mermaid
flowchart LR
  User[Analyst_or_Reviewer]
  UI[Nextjs_UI]
  API[API_routes]
  Ingest[Ingest_and_Index_pipeline]
  Compare[Compare_RAG_path]
  Ask[Ask_RAG_path]
  Store[(Fact_Knowledge_Store)]
  LLM[Groq_LLMs]
  Embed[Embedding_model]

  User --> UI --> API
  API --> Ingest
  API --> Compare
  API --> Ask
  Ingest --> Store
  Ingest --> LLM
  Ingest --> Embed
  Compare --> Store
  Compare --> LLM
  Compare --> Embed
  Ask --> Store
  Ask --> LLM
  Ask --> Embed
  Store --> UI
```

| Surface | Job |
|---------|-----|
| **Facts** | Browse grounded claims + evidence |
| **Compare** | Cross-doc Agrees / Conflicts / Different context |
| **Ask** | Question → hybrid retrieve → rerank → cited answer |
| **Issues** | Pipeline failures + HITL review queue |

---

## 2. End-to-end RAG architecture

Two loops share one index:

1. **Index-time (ingest):** PDF → structure chunks → extract facts → embed → hybrid index  
2. **Query-time:** Compare (new facts vs corpus) or Ask (natural language)

```mermaid
flowchart TB
  subgraph ingest [Index_time]
    PDF[PDF_upload]
    Parse[Parse_pages]
    Signal[Signal_prior]
    Struct[Structure_aware_segmentation]
    PC[Parent_child_chunks]
    Extract[Structured_LLM_extract]
    Facts[Facts_plus_Evidence]
    Card[Fact_card_builder]
    DenseIdx[Dense_vector_index]
    SparseIdx[Sparse_BM25_lexical_index]
    MetaIdx[Metadata_columns]
    PDF --> Parse --> Signal --> Struct --> PC --> Extract --> Facts
    Facts --> Card
    Card --> DenseIdx
    Facts --> SparseIdx
    Facts --> MetaIdx
  end

  subgraph query [Query_time]
    Trigger{Trigger}
    QEmbed[Embed_query_or_fact_card]
    Hybrid[Hybrid_retrieve]
    RRF[RRF_fusion]
    Rerank[Cascade_CE_plus_rare_LLM]
    Branch{Path}
    Heuristic[Heuristic_relation_classify]
    RelLLM[LLM_relation_classify]
    HITL[Confidence_HITL_gate]
    Gen[Grounded_answer_generator]
    Cite[Citations_page_quote]

    Trigger -->|new_document_facts| QEmbed
    Trigger -->|user_question| QEmbed
    QEmbed --> Hybrid
    DenseIdx --> Hybrid
    SparseIdx --> Hybrid
    MetaIdx --> Hybrid
    Hybrid --> RRF --> Rerank --> Branch
    Branch -->|Compare| Heuristic
    Heuristic -->|clear| HITL
    Heuristic -->|ambiguous| RelLLM --> HITL
    Branch -->|Ask| Gen --> Cite
  end
```

---

## 3. Ingest & indexing pipeline

```mermaid
flowchart TD
  U[Upload_PDF] --> V[Validate_MIME_magic_size]
  V --> H[SHA256_dedupe]
  H --> P[pdfjs_per_page_text]
  P --> S{Sparse_text?}
  S -->|yes| Ocr[Local_Tesseract_OCR]
  Ocr --> S2{Text_usable?}
  S2 -->|no| Fail[Failure_journal]
  S2 -->|yes| Sig[Score_page_signal]
  S -->|no| Sig
  Sig --> Seg[Detect_sections_and_tables]
  Seg --> Parent[Parent_chunk_section_or_table]
  Parent --> Child[Child_chunk_KPI_span_or_row_group]
  Child --> Ctx[Attach_parent_context_to_prompt]
  Ctx --> Ext[Groq_extract_JSON_Zod]
  Ext --> Fact[(facts)]
  Ext --> Ev[(evidence)]
  Fact --> MK[build_match_key]
  Fact --> FC[Build_fact_card_string]
  FC --> Emb[Embedding_API]
  Emb --> Vec[(fact_embeddings)]
  Ev --> EEmb[Embed_evidence_quote]
  EEmb --> EVec[(evidence_embeddings)]
  Fact --> Lex[Upsert_sparse_tokens]
  Fact --> Meta[entity_period_scope_unit_type]
```

### Stage responsibilities

| Stage | Input | Output | Notes |
|-------|--------|--------|-------|
| Validate / dedupe | File bytes | Stored doc or skip | Content-hash idempotency |
| Parse | PDF | Page texts | pdf.js text layer first |
| Local OCR | Sparse pages | OCR text | Tesseract.js + canvas; no LLM tokens; journal only if still empty |
| Signal prior | Pages with text | `signalScore` per page | KPI/finance density via [`signal.ts`](../src/lib/pdf/signal.ts); TOC/glossary penalized; selects extract budget |
| Structure segment | High-signal pages | `DocumentSection[]` | Heading heuristics in [`structure.ts`](../src/lib/pdf/structure.ts); inspect via job progress / `scripts/smoke-sections.ts` |
| Table blocks | Sections | `DocumentBlock` (`table` \| `narrative`) | Number/header heuristics in [`tables.ts`](../src/lib/pdf/tables.ts); inspect via `scripts/smoke-blocks.ts` |
| Hierarchy builder | Pages | parents + children | [`hierarchy.ts`](../src/lib/pdf/hierarchy.ts) — default path |
| Parent chunks | Blocks | `chunks.kind=parent` | [`parents.ts`](../src/lib/pdf/parents.ts) |
| Child chunks | Parents | `chunks.kind=child` + `parent_id` | [`children.ts`](../src/lib/pdf/children.ts); narrative packs + table header/row groups |
| Extract | Top children + parent context | Facts + evidence | [`extract.ts`](../src/lib/llm/extract.ts) + [`select-extract.ts`](../src/lib/pdf/select-extract.ts); Zod + repair |
| Fact card | Fact row | Canonical string | See §5 |
| Embed | Fact card / quote | Vectors | Versioned `embedding_model` |
| Sparse index | Fact-card tokens | `fact_sparse_postings` + BM25 | [`sparse.ts`](../src/lib/embeddings/sparse.ts) — `indexDocumentSparse` / `sparseSearch` |
| Metadata | Structured fields | Filterable columns | Used at retrieve time |

---

## 4. Parent–child chunking

```mermaid
flowchart TB
  Doc[Filing_document]
  Doc --> Sec1[Parent_Financial_Highlights]
  Doc --> Sec2[Parent_Revenue_note_table]
  Doc --> Sec3[Parent_Narrative_MD_and_A]

  Sec1 --> C1[Child_Revenue_from_operations_FY24]
  Sec1 --> C2[Child_EBITDA_FY24]
  Sec2 --> C3[Child_Table_row_Revenue_FY23_FY24]
  Sec3 --> C4[Child_Paragraph_capacity_utilization]

  C1 --> E1[Extract_fact_plus_quote]
  C2 --> E1
  C3 --> E1
  C4 --> E1

  E1 --> IndexChild[Index_child_for_retrieval]
  Sec1 --> KeepParent[Keep_parent_for_context_expansion]
  Sec2 --> KeepParent
```

| Chunk | Typical size | Indexed? | Role |
|-------|--------------|----------|------|
| **Parent** | Section / table (~1–2k tokens) | Optional | Context for extract + Ask expansion |
| **Child** | KPI span / row group (~200–800 tokens) | **Yes** | Embed, BM25, cite, extract target |

Table children keep **row label + period columns + values** together so period/scope are not lost.

---

## 5. Embedding strategy

Index text builders: [`index-text.ts`](../src/lib/embeddings/index-text.ts).  
Index-time embed after extract: [`index-document.ts`](../src/lib/embeddings/index-document.ts) (facts + evidence; skip/re-embed on model bump).  
Evidence Ask prep: sparse postings + [`hybridRetrieveEvidence`](../src/lib/embeddings/hybrid-ask.ts) → CE rerank → grounded generate (A0–A7).

### Fact card template (Compare / matching)

```text
entity | fact_type | claim | raw_value | unit | period | scope
```

Example:

```text
Delhivery Limited | revenue | Revenue from operations | 8143 | crore | FY24 | consolidated
```

### Evidence template (Ask)

```text
page={n} | {verbatim_quote}
```

### Dual index

```mermaid
flowchart LR
  Fact[Fact_row] --> Card[Fact_card_text]
  Ev[Evidence_row] --> Quote[Evidence_text]
  Card --> DE[Dense_embed]
  Quote --> DE2[Dense_embed]
  Fact --> SP[Sparse_tokenize]
  DE --> V1[(fact_embeddings)]
  DE2 --> V2[(evidence_embeddings)]
  SP --> BM[(lexical_index)]
```

| Decision | Choice |
|----------|--------|
| Provider | **Local free** `Xenova/all-MiniLM-L6-v2` (384-d) via `@huggingface/transformers` |
| Spaces | Same embedding model for index + query |
| Similarity | Cosine on L2-normalized vectors |
| Storage | SQLite `fact_embeddings` / `evidence_embeddings` — Float32 little-endian BLOBs ([`vector-codec.ts`](../src/lib/embeddings/vector-codec.ts)); upsert/get/list/delete in [`db/embeddings.ts`](../src/lib/db/embeddings.ts) |
| Dense recall | Brute-force cosine via [`denseSearch`](../src/lib/embeddings/dense.ts) / `denseSearchEvidence` (ANN/pgvector later) |
| Versioning | Store `model` + `dimensions`; re-embed on bump |
| Filters | SQL/metadata filters **plus** text baked into card |

---

## 6. Hybrid retrieval + RRF (Compare path)

When a new document’s facts are ready, each new fact retrieves candidates from **other documents only**.

```mermaid
flowchart TD
  NF[New_fact] --> CardQ[Embed_fact_card]
  NF --> MK[Exact_match_key_lookup]
  NF --> BM[BM25_over_claim_entity_type]
  CardQ --> ANN[Dense_topK_cosine]

  MK --> C1[Candidate_set_A]
  BM --> C2[Candidate_set_B]
  ANN --> C3[Candidate_set_C]

  C1 --> RRF[Reciprocal_Rank_Fusion]
  C2 --> RRF
  C3 --> RRF
  Meta[Metadata_soft_hard_filters] --> RRF

  RRF --> TopN[Top_N_about_30]
  TopN --> CE[Cross_encoder_scores_all]
  CE -->|s >= CE_HIGH| Keep[Accept_CE]
  CE -->|s <= CE_LOW| Drop[Reject]
  CE -->|mid| LLM[Rare_LLM_pointwise]
  Keep --> Merge[Blend_sort_top_M]
  LLM --> Merge
  Drop --> X[Discard]
  Merge --> Cls[Classify_stage]
```

**RRF:** for each candidate id,  
`score = Σ 1 / (k + rank_in_list_i)` across match_key / BM25 / dense lists, then sort  
([`rrf.ts`](../src/lib/embeddings/rrf.ts), default `k=60` via `RRF_K`).

**Cascade rerank:** CE (`Xenova/ms-marco-MiniLM-L-6-v2`) scores every pair; LLM only when `CE_LOW < s < CE_HIGH` (capped by `RERANK_LLM_MAX_PER_DOC`). Final mid score = `α·CE + (1-α)·LLM` (`RERANK_CE_BLEND`).

**Compare wiring:** hybrid → [`rerankFactPairs`](../src/lib/pipeline/rerank.ts) → heuristic/LLM classify.

**Metadata (soft only):** [`metadataSoftBoost`](../src/lib/embeddings/metadata-filters.ts) multiplies RRF scores for same entity family / unit / fact_type / period (`ENTITY_FAMILY_BOOST`, …). Different periods are **kept** so classify can emit `reconciled`. Period stays out of `match_key` by design.

---

## 7. Rerank → classify → HITL (Compare)

```mermaid
flowchart TD
  TopM[Reranked_fact_pairs] --> H{Heuristic_clear?}
  H -->|yes_equal_numbers| Agr[corroborates_Agrees]
  H -->|yes_diff_value_diff_period| Rec[reconciled_Different_context]
  H -->|yes_same_period_conflict| Con[contradicts_Conflicts]
  H -->|ambiguous| LLM[Batched_LLM_classify]
  LLM --> Agr
  LLM --> Rec
  LLM --> Con
  LLM --> Un[unrelated_drop]

  Agr --> Gate{Confidence_and_type}
  Rec --> Gate
  Con --> Gate

  Gate -->|contradicts_and_low_conf| Review[needs_review_HITL]
  Gate -->|else| Auto[auto_accepted]
  Review --> Human{Analyst}
  Human -->|confirm| Confirmed[confirmed]
  Human -->|reject| Rejected[rejected]
```

| Relation | UI label | Meaning |
|----------|----------|---------|
| `corroborates` | Agrees | Same underlying claim |
| `contradicts` | Conflicts | Genuine conflict given context |
| `reconciled` | Different context | Explained by time / scope / units |
| `unrelated` | — | Not stored |

Heuristics (stage 1) short-circuit clear cases without Groq:
- matching numbers → `corroborates`
- equal numbers + different **unit/scope** → `reconciled`
- different values + different **period/unit/scope** → `reconciled`
- same period/unit/scope + conflicting numbers → `contradicts`
- different entity family or fact type (weak rerank) → `unrelated` (dropped)
- strong rerank + odd entity/type → leave for LLM

LLM (stage 2) only sees remaining ambiguous post-rerank pairs:
- Stronger finance prompt (`CLASSIFY_SYSTEM_PROMPT`) preferring reconciled/unrelated over false conflicts
- Batched via `MATCH_BATCH_SIZE` on `GROQ_MATCH_MODEL`
- Soft parse: clamp confidence, missing indexes → null + failure journal (job continues)

---

## 8. Ask path (classical grounded generation)

```mermaid
flowchart TD
  Q[User_question] --> Hint[Optional_entity_period_hints]
  Q --> QE[Embed_question]
  Hint --> Filt[Metadata_prefilter]
  QE --> Hyb[Hybrid_retrieve_facts_and_evidence]
  Filt --> Hyb
  Hyb --> RRF2[RRF]
  RRF2 --> RR2[Rerank_passages]
  RR2 --> Enough{Retrieval_confident?}
  Enough -->|no| Refuse[Refuse_or_ask_clarify]
  Enough -->|yes| Ctx[Build_context_pack_with_parent_optional]
  Ctx --> Gen[Groq_generate_answer]
  Gen --> Out[Answer_plus_citations]
  Out --> Cite[factId_page_quote]
```

Rules:

- Answer **only** from retrieved evidence  
- Every claim in the answer maps to a citation  
- Low retrieval confidence → refuse (no hallucination path)

---

## 9. Logical data model

```mermaid
erDiagram
  DOCUMENTS ||--o{ CHUNKS : contains
  DOCUMENTS ||--o{ FACTS : yields
  CHUNKS ||--o{ FACTS : sourced_from
  FACTS ||--o{ EVIDENCE : grounded_by
  FACTS ||--o| FACT_EMBEDDINGS : has_vector
  EVIDENCE ||--o| EVIDENCE_EMBEDDINGS : has_vector
  FACTS ||--o{ RELATIONS : fact_a
  FACTS ||--o{ RELATIONS : fact_b
  DOCUMENTS ||--o{ FAILURES : journals

  DOCUMENTS {
    string id
    string content_hash
    string status
  }
  CHUNKS {
    string id
    string kind
    string parent_id
    string section_title
    int page_start
    int page_end
  }
  FACTS {
    string id
    string claim
    float numeric_value
    string unit
    string period
    string scope
    string entity
    string fact_type
    string match_key
    float confidence
  }
  EVIDENCE {
    string id
    int page
    string quote
  }
  FACT_EMBEDDINGS {
    string fact_id
    string model
    int dimensions
    blob embedding
    string index_text
  }
  EVIDENCE_EMBEDDINGS {
    string evidence_id
    string model
    int dimensions
    blob embedding
    string index_text
  }
  RELATIONS {
    string relation_type
    float confidence
    string review_status
    string context_tags
  }
  %% review_status: auto_accepted | needs_review | confirmed | rejected
```

---

## 10. Module map

```mermaid
flowchart LR
  subgraph pdf [src/lib/pdf]
    parse[parse.ts]
    structure[structure.ts]
    chunk[chunk.ts]
  end
  subgraph pipe [src/lib/pipeline]
    extract[extract-stage.ts]
    candidates[match-candidates.ts]
    rerank[rerank.ts]
    classify[classify-relation.ts]
    match[match.ts]
  end
  subgraph emb [src/lib/embeddings]
    indexText[index-text.ts]
    client[client.ts]
    codec[vector-codec.ts]
    indexDoc[index-document.ts]
    sparse[sparse.ts]
    dense[dense.ts]
    rrf[rrf.ts]
    hybrid[hybrid.ts]
    hybridAsk[hybrid-ask.ts]
  end
  subgraph dbemb [src/lib/db]
    migrateEmb[migrate-embeddings.ts]
    embCrud[embeddings.ts]
    migrateSparse[migrate-sparse.ts]
    sparseCrud[sparse.ts]
  end
  subgraph llm [src/lib/llm]
    groq[groq.ts]
    schemas[schemas.ts]
  end

  parse --> structure --> chunk --> extract
  extract --> indexDoc
  indexDoc --> indexText --> client
  client --> codec --> embCrud
  migrateEmb --> embCrud
  extract --> sparse
  sparse --> sparseCrud
  migrateSparse --> sparseCrud
  indexDoc --> hybrid
  sparse --> hybrid
  dense --> hybrid
  hybrid --> rrf --> match
  match --> candidates --> rerank --> classify
  classify --> llm
```

---

## 11. Embeddings / hybrid pipeline checklist

| # | Stage | Status | Entry |
|---|--------|--------|--------|
| 1 | Fact card / evidence index text | done | [`index-text.ts`](../src/lib/embeddings/index-text.ts) |
| 2 | Free local MiniLM embed client | done | [`client.ts`](../src/lib/embeddings/client.ts) |
| 3 | Vector storage schema + CRUD | done | [`migrate-embeddings.ts`](../src/lib/db/migrate-embeddings.ts) |
| 4 | Index on ingest | done | [`index-document.ts`](../src/lib/embeddings/index-document.ts) |
| 5 | Sparse / BM25 | done | [`sparse.ts`](../src/lib/embeddings/sparse.ts) |
| 6 | Dense cosine search | done | [`dense.ts`](../src/lib/embeddings/dense.ts) |
| 7 | Hybrid + RRF → Compare | done | [`hybrid.ts`](../src/lib/embeddings/hybrid.ts) |
| 8 | Metadata soft filters + caps | done | [`metadata-filters.ts`](../src/lib/embeddings/metadata-filters.ts) |
| 9 | Evidence Ask prep | done | [`hybrid-ask.ts`](../src/lib/embeddings/hybrid-ask.ts) |
| 10 | Fixtures + smoke | done | [`fixtures.ts`](../src/lib/embeddings/fixtures.ts), `npm run smoke:hybrid` |

**Rerank (Compare):** cascade CE + rare LLM — implemented.  
**Out of scope:** GraphRAG / agentic RAG.

### Ask path checklist (A0–A7)

| # | Stage | Status | Entry |
|---|--------|--------|--------|
| A0 | Hybrid evidence retrieve (BM25 ∪ dense → RRF) | done | [`hybrid-ask.ts`](../src/lib/embeddings/hybrid-ask.ts) |
| A1 | Ask config + citation/answer Zod schemas | done | [`config.ts`](../src/lib/config.ts) `getAskConfig`, [`schemas.ts`](../src/lib/llm/schemas.ts) |
| A2 | Rerank evidence (CE on question↔quote) | done | [`ask-rerank.ts`](../src/lib/pipeline/ask-rerank.ts) |
| A3 | Context pack + refuse gate | done | [`ask-context.ts`](../src/lib/pipeline/ask-context.ts) |
| A4 | Grounded generate (Groq JSON + citations) | done | [`ask-generate.ts`](../src/lib/pipeline/ask-generate.ts) |
| A5 | `askQuestion` + `POST /api/ask` | done | [`ask.ts`](../src/lib/pipeline/ask.ts), [`api/ask`](../src/app/api/ask/route.ts) |
| A6 | Ask UI tab | done | [`ask-panel.tsx`](../src/components/ask-panel.tsx) |
| A7 | Fixtures + smoke | done | [`ask-fixtures.ts`](../src/lib/pipeline/ask-fixtures.ts), `npm run smoke:ask` |

### Classify / HITL checklist (C1–C6)

| # | Stage | Status | Entry |
|---|--------|--------|--------|
| C1 | Heuristics (unit/scope/entity/unrelated) | done | [`classify-relation.ts`](../src/lib/pipeline/classify-relation.ts) |
| C2 | LLM batch parse harden | done | `parseClassifyBatchResponse` / `normalizeClassificationResult` |
| C3 | `review_status` persist + gate | done | [`review-status.ts`](../src/lib/pipeline/review-status.ts) |
| C4 | Threshold / classify config | done | [`config.ts`](../src/lib/config.ts) |
| C5 | HITL API + Compare/Issues UI | done | `POST /api/relations/:id/review` |
| C6 | Golden fixtures + offline eval | done | [`classify-fixtures.ts`](../src/lib/pipeline/classify-fixtures.ts), `npm run smoke:classify` |

Smoke:

```bash
npm test
npm run smoke:hybrid     # offline hybrid recall fixture
npm run smoke:classify   # offline Agrees/Conflicts/Reconciled/Unrelated + HITL goldens
npm run smoke:ask        # offline Ask refuse/cite goldens (mocked CE + Groq)
npm run smoke:embed      # optional live MiniLM download
```

---

## 12. Interview one-liner

> “This is a **classical hybrid RAG** over a fact ledger: structure-aware parent–child indexing, dual embeddings (fact cards + evidence), hybrid sparse+dense retrieval with RRF, cascade CE rerank (rare LLM mid-band), then either three-way relation classification or citation-grounded Ask — not GraphRAG and not agentic RAG.”

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [SCALABILITY.md](SCALABILITY.md) · [DEMO_CASES.md](DEMO_CASES.md) · [API.md](API.md)
