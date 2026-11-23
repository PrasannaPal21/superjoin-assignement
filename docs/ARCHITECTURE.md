# Architecture

## Goal

Turn uploaded PDFs into a **fact knowledge layer** powered by **Classical Hybrid RAG**: grounded claims with evidence, hybrid retrieval across documents, reranked candidates, then either:

- **Compare** — relations `corroborates` (Agrees) / `contradicts` (Conflicts) / `reconciled` (Different context), or
- **Ask** — citation-grounded answers over the same index.

Document-agnostic: no hard-coded company facts, filenames, or schemas. New PDFs extend the layer incrementally.

Full RAG diagrams: [RAG_ARCHITECTURE.md](RAG_ARCHITECTURE.md).

## Components

```text
UI (Next.js) → API routes → job queue → pipeline worker
                                      ↓
     parse → structure parent/child → extract → embed (dense+sparse)
                                      ↓
              hybrid recall → RRF → rerank → classify | Ask
                                      ↓
              facts + evidence + embeddings + relations
```

### Storage

| Table / index | Role |
|---------------|------|
| `documents` | Upload metadata, content hash, status |
| `jobs` / `pipeline_runs` | Queue + progress checkpoints |
| `chunks` | Hierarchy text units: `kind` (`parent` \| `child`; legacy `flat` may exist in old DBs), `parent_id`, `section_title`, `block_kind` |
| `facts` | Normalized claims (`fact_type` free-form; `match_key`) |
| `evidence` | Quote + page grounding |
| `fact_embeddings` / `evidence_embeddings` | Dense vectors + `embedding_model` |
| Sparse / BM25 postings | Lexical recall over claim / entity / type |
| `relations` | Pairwise links + `review_status` (HITL) |
| `failures` | Honest failure journal |

Local default: SQLite with a vector extension. Schema maps cleanly to Postgres + pgvector ([SCALABILITY.md](SCALABILITY.md)).

## Pipeline stages

### Index-time

1. **Validate & store** — extension, MIME, magic bytes, size cap, SHA-256 dedupe.
2. **Parse + local OCR** — pdf.js per-page text; sparse/image pages → rasterize → **Tesseract.js** (no LLM tokens). Journal only if text is still unusable after OCR.
3. **Signal prior** — score each page for finance/KPI density ([`signal.ts`](../src/lib/pdf/signal.ts)); drop TOC/glossary; keep top pages under extract budget. Budget only — not section boundaries.
4. **Structure (sections + blocks)** — detect finance headings ([`structure.ts`](../src/lib/pdf/structure.ts)), then split each section into **table** vs **narrative** blocks ([`tables.ts`](../src/lib/pdf/tables.ts)).
5. **Parent–child hierarchy** — [`hierarchy.ts`](../src/lib/pdf/hierarchy.ts) / [`parents.ts`](../src/lib/pdf/parents.ts) / [`children.ts`](../src/lib/pdf/children.ts): blocks → `kind=parent` → `kind=child` with `parent_id`. Flat page-packing is removed.
6. **Extract** — Groq JSON on **child** chunks with parent/section context (`GROQ_EXTRACT_MODEL`); top children by signal capped by `MAX_EXTRACT_CHUNKS` ([`select-extract.ts`](../src/lib/pdf/select-extract.ts)); Zod + JSON repair; ~12 facts / child. Evidence quotes come from the child excerpt.
7. **Index** — `match_key`; sparse tokens; embed fact cards + evidence quotes.

### Query-time (Compare)

8. **Hybrid recall** — exact `match_key` ∪ BM25 ∪ dense top-K; metadata soft filters; **RRF** fusion; cap `RERANK_TOP_N`.
9. **Rerank** — LLM scores pair relevance `0–1`; keep `RERANK_TOP_M`; drop below `RERANK_MIN_SCORE`.
10. **Classify** — heuristics for clear numeric/period cases; batched LLM otherwise (`MATCH_BATCH_SIZE`).
11. **HITL gate** — `contradicts` with confidence &lt; `CONFLICT_REVIEW_THRESHOLD` → `needs_review`.

### Query-time (Ask)

12. Embed question → hybrid retrieve facts/evidence → RRF → rerank → generate **only** from context → citations `{factId, page, quote}` or refuse.

New documents match **against existing facts only**. Older documents are not re-extracted on every ingest.

## LLM & embedding boundary

- **Groq** — extract, classify, rerank, Ask (role-specific models).
- **Embedding API** — OpenAI-compatible; same model for index and query.
- PDF text treated as **untrusted data**.
- Structured outputs validated with Zod.

## UI

Document rail + **Facts** / **Compare** / **Ask** / **Issues** (demo coverage, HITL review, pipeline log).
