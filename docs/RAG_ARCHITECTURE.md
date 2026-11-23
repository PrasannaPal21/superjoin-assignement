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
    Rerank[LLM_reranker]
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
| Signal prior | Pages | Priority set | Prefer KPI-dense pages; drop TOC |
| Structure segment | Pages | Sections / tables | Boundaries from layout, not token windows |
| Parent–child | Sections | Parent + children | Extract on child; parent as context |
| Extract | Child + parent ctx | Facts + evidence | Cheaper extract model; Zod + repair |
| Fact card | Fact row | Canonical string | See §5 |
| Embed | Fact card / quote | Vectors | Versioned `embedding_model` |
| Sparse index | Tokens from claim/entity/type | BM25 / lexical posting | Complements dense |
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

### Fact card template (Compare / matching)

```text
entity | fact_type | claim | raw_value | unit | period | scope
```

Example:

```text
delhivery | revenue | Revenue from operations | 8143 | crore | FY24 | consolidated
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
| Spaces | Same embedding model for index + query |
| Similarity | Cosine on L2-normalized vectors |
| Versioning | Store `embedding_model` + dim; re-embed on bump |
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
  TopN --> RR[LLM_batch_rerank_scores_0_to_1]
  RR --> Cut[Drop_below_threshold]
  Cut --> TopM[Top_M_about_8_to_16]
  TopM --> Cls[Classify_stage]
```

**RRF:** for each candidate id,  
`score = Σ 1 / (k + rank_in_list_i)` across match_key / BM25 / dense lists, then sort.

**Metadata:** prefer same entity family; do **not** hard-drop different periods (needed for `reconciled`). Period stays out of `match_key` by design.

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

Heuristics short-circuit clear numeric/period cases; LLM only sees post-rerank ambiguous pairs.

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
    int page_start
    int page_end
    string section_title
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
    vector embedding
    string model
  }
  RELATIONS {
    string relation_type
    float confidence
    string review_status
    string context_tags
  }
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
    embed[embed.ts]
    store[store.ts]
  end
  subgraph llm [src/lib/llm]
    groq[groq.ts]
    schemas[schemas.ts]
  end

  parse --> structure --> chunk --> extract
  extract --> embed
  embed --> store
  extract --> match
  match --> candidates --> rerank --> classify
  classify --> llm
  embed --> llm
```

---

## 11. Interview one-liner

> “This is a **classical hybrid RAG** over a fact ledger: structure-aware parent–child indexing, dual embeddings (fact cards + evidence), hybrid sparse+dense retrieval with RRF, LLM reranking, then either three-way relation classification or citation-grounded Ask — not GraphRAG and not agentic RAG.”

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [SCALABILITY.md](SCALABILITY.md) · [DEMO_CASES.md](DEMO_CASES.md) · [API.md](API.md)
