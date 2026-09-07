# Scalability

## What works today

- **Large PDFs**: page capping (`MAX_PAGES`), chunking, progress checkpoints, concurrent extraction pool bounded by `MAX_CONCURRENT_EXTRACTIONS`.
- **Many PDFs**: incremental matching — new docs compare to existing facts only.
- **Evolving schema**: `fact_type` is a free string; UI filters grow from distinct DB values.
- **Idempotent re-upload**: SHA-256 content hash dedupe avoids rebuilds.

## Bottlenecks

1. Groq rate limits / latency (dominant cost).
2. Single Node process holding the worker loop.
3. SQLite write throughput under heavy parallel ingest.

## Scale-out path (documented, not required to run)

| Layer | Next step |
|-------|-----------|
| Queue | Move `jobs` to Redis + BullMQ / pg-boss |
| DB | Postgres with the same relational schema |
| Files | S3-compatible object storage |
| Workers | Separate worker service(s); horizontal replicas |
| Matching | Embedding index (pgvector) for candidate recall |
| OCR | Optional Tesseract/cloud OCR lane for image PDFs |

The prototype already separates **API**, **queue rows**, and **pipeline stages** so those swaps stay localized.
