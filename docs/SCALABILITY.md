# Scalability

## What the Classical Hybrid RAG stack does well

- **Large PDFs:** page caps (`MAX_PAGES`), signal prior for budget, structure-aware parent/child packing, `MAX_EXTRACT_CHUNKS`, progress checkpoints, concurrent extract pool.
- **Many PDFs:** incremental Compare — new docs hybrid-match against existing facts only (no full corpus rebuild).
- **Paraphrase recall:** dense fact-card embeddings + BM25 + `match_key`, fused with RRF, then reranked before classify.
- **Evolving schema:** `fact_type` is a free string; UI filters grow from distinct DB values.
- **Idempotent re-upload:** SHA-256 content hash dedupe avoids rebuilds.
- **Cost controls:** cheaper extract/rerank models, heuristic relation short-circuit, `RERANK_TOP_N` → `RERANK_TOP_M`, batched classify (`MATCH_BATCH_SIZE`).
- **Safe conflicts:** HITL gate on low-confidence `contradicts` reduces false alarms at publish time.

## Bottlenecks

1. Groq + embedding API rate limits / latency (dominant cost).
2. Single Node process holding the worker loop (assignment default).
3. SQLite write + vector throughput under heavy parallel ingest.

## Scale-out path

| Layer | Next step |
|-------|-----------|
| Queue | Redis + BullMQ / Temporal / pg-boss |
| DB | Postgres with the same relational schema |
| Vectors | pgvector (same fact/evidence embedding tables) |
| Files | S3-compatible object storage |
| Workers | Separate worker service(s); horizontal replicas |
| Rerank | Optional cross-encoder behind the same `rerank.ts` interface |
| OCR | Optional Tesseract/cloud OCR lane for image PDFs |
| Tenancy | Auth + `tenant_id` on documents/facts/embeddings |

The app already separates **API**, **queue/progress**, and **pipeline stages** (chunk → extract → embed → hybrid recall → rerank → classify / Ask) so those swaps stay localized.

## Cost knobs (ops)

| Knob | Effect |
|------|--------|
| `MAX_EXTRACT_CHUNKS` | Caps LLM extract calls per PDF |
| `RERANK_TOP_N` / `RERANK_TOP_M` | Caps rerank → classify volume |
| `MAX_MATCH_PAIRS` | Hard ceiling after fusion |
| `MAX_CONCURRENT_EXTRACTIONS` | Protects TPM limits |
| `CONFLICT_REVIEW_THRESHOLD` | Routes more/fewer conflicts to HITL |
