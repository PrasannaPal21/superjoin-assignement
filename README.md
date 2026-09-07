# Fact Knowledge Layer

Extract grounded facts from PDFs, keep every claim tied to source evidence, and compare them across documents — **agrees**, **conflicts**, or **different context** (time / scope / units).

General-purpose pipeline: no hard-coded company facts, filenames, or schemas. Built for the Superjoin VIT 2026 Engineering Intern assignment.

## Setup and Run Instructions

### Prerequisites

- Node.js **20+** (tested on 22)
- A [Groq](https://console.groq.com/) API key

### Install

```bash
cp .env.example .env
# set GROQ_API_KEY=...

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
curl http://localhost:3000/api/health   # should report llm.configured: true
npm test                                # unit tests (no API key)
```

### Process the starter dataset

1. Upload the three PDFs in [`starter-datasets/`](starter-datasets/) (UI or `POST /api/upload`).
2. Wait until each document shows **Ready** in the sidebar.
3. **Facts** — ledger of values + claims; click a row for the source quote; click a document to filter.
4. **Compare** — Agrees / Conflicts / Different context with side-by-side evidence.
5. **Issues** — coverage checklist for the four required demo cases + pipeline log.

Production deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md). Submission checklist: [`docs/SUBMIT.md`](docs/SUBMIT.md).

### Environment

| Variable | Purpose | Default |
|----------|---------|---------|
| `GROQ_API_KEY` | Required | — |
| `GROQ_MODEL` | Default / match model | `openai/gpt-oss-120b` |
| `GROQ_EXTRACT_MODEL` | Cheaper bulk extraction | `openai/gpt-oss-20b` |
| `GROQ_MATCH_MODEL` | Ambiguous relation pairs | `openai/gpt-oss-120b` |
| `GROQ_FALLBACK_MODELS` | On `model_not_found` | `openai/gpt-oss-20b` |
| `MAX_UPLOAD_MB` | Upload size cap | `40` |
| `MAX_PAGES` | Pages parsed per PDF | `500` |
| `CHUNK_PAGES` | Soft max pages / extract call | `8` |
| `CHUNK_CHAR_BUDGET` | Soft max chars / extract call | `12000` |
| `MAX_EXTRACT_CHUNKS` | Hard cap extract calls / PDF | `16` |
| `MAX_MATCH_PAIRS` | Cap relation candidates / PDF | `16` |
| `MATCH_BATCH_SIZE` | Pairs per match API call | `6` |
| `MAX_CONCURRENT_JOBS` | Parallel documents | `1` |
| `MAX_CONCURRENT_EXTRACTIONS` | Parallel extract calls | `4` |
| `DATABASE_PATH` | SQLite file | `data/factlayer.db` |
| `UPLOAD_DIR` | Stored PDFs | `data/uploads` |

Never commit real keys.

## Video Demo

> **Paste your ≤3 minute demo link here before submitting** (Loom / YouTube unlisted / Drive).

Script: [`docs/DEMO_CASES.md`](docs/DEMO_CASES.md).

## Approach

### Problem

Facts in filings are scattered, restated differently, or only *apparently* conflicting. A useful system must extract claims, ground them in evidence, and explain cross-document relationships — including when context (period, scope, units) reconciles a conflict.

### Architecture

Single **Next.js** app (UI + API). Disk uploads + **SQLite**. In-process worker:

**validate → parse → signal-aware chunk → Groq extract → candidate match → classify relations**

More detail: [ARCHITECTURE](docs/ARCHITECTURE.md) · [API](docs/API.md) · [SECURITY](docs/SECURITY.md) · [SCALABILITY](docs/SCALABILITY.md)

### Decisions that matter

- **Zero-ops local stack** (SQLite + job table) so evaluators run without Redis/Postgres.
- **Incremental knowledge layer** — new PDFs match against existing facts; no full rebuild.
- **Cost-aware LLM use** — high-signal page packing, extract caps, cheaper extract model, heuristic matches first, batched LLM classification.
- **Evolving `fact_type`** — taxonomy grows with documents.
- **Content-hash dedupe** — identical re-uploads are skipped.
- **Honest failure journal** — parse/extract/match issues are first-class.
- **UI** — document rail + Facts / Compare / Issues; values first, evidence on demand.

### Trade-offs

- Best on text-layer PDFs; scanned PDFs need OCR (not in v1).
- Lexical/`match_key` candidate recall is cheap but can miss paraphrases vs embeddings.
- In-process workers are simple; multi-instance production should externalize the queue.

### AI tools used

- **Groq** for structured extraction and relation classification (`gpt-oss-20b` extract / `gpt-oss-120b` match by default).
- Coding assistants (Cursor) during implementation.
- Offline shape sample: [`fixtures/sample-output.json`](fixtures/sample-output.json).

## Limitations and Next Steps

**Weak today:** image-only PDFs; messy table reading order; vague co-reference; relation coverage under rate limits.

**Next:** OCR lane, embedding recall (pgvector), Postgres + Redis workers, human confirm on low-confidence conflicts, exportable audit packs.

## Additional Notes

- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deploy (Render Free + keep-alive): [docs/DEPLOY.md](docs/DEPLOY.md)
- Submit form prep: [docs/SUBMIT.md](docs/SUBMIT.md)
- Offline sample: [fixtures/sample-output.json](fixtures/sample-output.json)
- Starter corpus: [`starter-datasets/`](starter-datasets/)
- Assignment brief: `superjoin-vit-2026-assignment.pdf`
- Brownie coverage: large PDFs, many docs, evolving schema, incremental ingest

**Live demo (optional):** _add your Render URL here after deploy_

### Pre-submit checklist

- [x] Runs from these instructions; accepts new PDFs via UI/API
- [x] Facts + evidence + cross-document relations
- [x] Four required cases demonstrable (Compare + Issues)
- [ ] Demo video ≤ 3 min linked above
- [ ] GitHub repo submitted via [form](https://forms.gle/3fLdBQ2D6Zm2Gqtv7)
