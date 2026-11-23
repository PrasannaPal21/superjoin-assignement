# Fact Knowledge Layer

Classical **Hybrid RAG** over a grounded fact store: extract claims from PDFs with evidence, index them for hybrid retrieval, rerank candidates, then either **compare** facts across documents or **ask** questions with citations.

Cross-document relations: **Agrees** (`corroborates`), **Conflicts** (`contradicts`), or **Different context** (`reconciled` — time / scope / units).

General-purpose pipeline: no hard-coded company facts, filenames, or schemas. Built for the Superjoin VIT 2026 Engineering Intern assignment.

## Architecture label

| | |
|--|--|
| **Family** | Classical Hybrid RAG |
| **Retrieve** | `match_key` + BM25/lexical + dense embeddings → RRF |
| **Rank** | LLM reranker → top-M pairs / passages |
| **Chunking** | Structure-aware **parent–child** (sections/tables → KPI spans) |
| **Not used** | GraphRAG, Agentic / Self / Corrective RAG, HyDE, Adaptive, Multimodal RAG |

Pipeline (index-time):

```text
validate → parse → signal prior → structure segment → parent/child chunks
  → Groq extract → fact cards + evidence → dense + sparse index
```

Pipeline (query-time Compare):

```text
hybrid recall → RRF → rerank → heuristic/LLM classify → HITL gate
```

Pipeline (query-time Ask):

```text
hybrid retrieve facts/evidence → RRF → rerank → grounded answer + citations
```

Deep dive with Mermaid diagrams: [docs/RAG_ARCHITECTURE.md](docs/RAG_ARCHITECTURE.md) · runtime notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Setup and Run Instructions

### Prerequisites

- Node.js **20+** (tested on 22)
- A [Groq](https://console.groq.com/) API key (extract, match, rerank, Ask)
- An embedding API key / base URL (fact-card + evidence vectors)

### Install

```bash
cp .env.example .env
# set GROQ_API_KEY=...
# set EMBEDDING_API_KEY=... (and EMBEDDING_BASE_URL / EMBEDDING_MODEL if needed)

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
curl http://localhost:3000/api/health   # llm + embeddings configured
npm test                                # unit tests
npm run eval                            # golden RAG evals (when fixtures present)
```

### Process the starter dataset

1. Upload the three PDFs in [starter-datasets/](starter-datasets/) (UI or `POST /api/upload`).
2. Wait until each document shows **Ready** in the sidebar.
3. **Facts** — ledger of values + claims; expand a row for quote + page; filter by document.
4. **Compare** — Agrees / Conflicts / Different context; confirm low-confidence conflicts in review if prompted.
5. **Ask** — natural-language question over the fact store; answers must cite page + quote.
6. **Issues** — demo-case checklist, HITL queue, and pipeline failure log.

Production deploy: [docs/DEPLOY.md](docs/DEPLOY.md). Submission checklist: [docs/SUBMIT.md](docs/SUBMIT.md).

### Environment

| Variable | Purpose | Default |
| -------- | ------- | ------- |
| `GROQ_API_KEY` | Required for extract / match / rerank / Ask | — |
| `GROQ_MODEL` | Default chat model | `openai/gpt-oss-120b` |
| `GROQ_EXTRACT_MODEL` | Bulk structured extraction | `openai/gpt-oss-20b` |
| `GROQ_MATCH_MODEL` | Ambiguous relation pairs | `openai/gpt-oss-120b` |
| `GROQ_RERANK_MODEL` | Candidate / passage reranker | `openai/gpt-oss-20b` |
| `GROQ_FALLBACK_MODELS` | On `model_not_found` | `openai/gpt-oss-20b` |
| `EMBEDDING_API_KEY` | Dense embeddings | — |
| `EMBEDDING_BASE_URL` | OpenAI-compatible embeddings endpoint | provider default |
| `EMBEDDING_MODEL` | Embedding model id | set in `.env.example` |
| `MAX_UPLOAD_MB` | Upload size cap | `40` |
| `MAX_PAGES` | Pages parsed per PDF | `500` |
| `CHUNK_PAGES` / `CHUNK_CHAR_BUDGET` | Parent pack soft limits | `8` / `12000` |
| `MAX_EXTRACT_CHUNKS` | Hard cap extract calls / PDF | `16` |
| `MAX_MATCH_PAIRS` | Cap after RRF / before rerank budget | `16` |
| `RERANK_TOP_N` / `RERANK_TOP_M` | Rerank in → out | `30` / `12` |
| `RERANK_MIN_SCORE` | Drop weak pairs / passages | `0.35` |
| `MATCH_BATCH_SIZE` | Pairs per classify API call | `6` |
| `CONFLICT_REVIEW_THRESHOLD` | Conflicts below this → HITL | `0.75` |
| `MAX_CONCURRENT_JOBS` | Parallel documents | `1` |
| `MAX_CONCURRENT_EXTRACTIONS` | Parallel extract calls | `1`–`4` |
| `DATABASE_PATH` | SQLite (+ vector extension) path | `data/factlayer.db` |
| `UPLOAD_DIR` | Stored PDFs | `data/uploads` |

Never commit real keys.

## Video Demo

> [https://drive.google.com/file/d/1iNaXdtPxeBJeXbB1O5kydT2Owdr5yEvd/view?usp=sharing](https://drive.google.com/file/d/1iNaXdtPxeBJeXbB1O5kydT2Owdr5yEvd/view?usp=sharing)

## Approach

### Problem

Facts in filings are scattered, restated differently, or only *apparently* conflicting. A useful system must extract claims, ground them in evidence, retrieve related claims across documents with high recall, and explain relationships — including when context (period, scope, units) reconciles a conflict. Analysts also need **Ask** with citations, not only a static ledger.

### Architecture

Single **Next.js** app (UI + API) with disk uploads, SQLite knowledge store, and dense + sparse indexes:

1. **Structure-aware parent–child chunking** (signal score only prioritizes pages)
2. **Groq structured extract** → facts + evidence
3. **Dual embeddings** — fact cards for Compare; evidence quotes for Ask
4. **Hybrid recall** (`match_key` + BM25 + dense) → **RRF** → **LLM rerank**
5. **Classify** — heuristics first; batched LLM for ambiguous pairs; HITL on weak conflicts
6. **Ask** — same hybrid index → grounded generation with mandatory citations

More detail: [RAG architecture](docs/RAG_ARCHITECTURE.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [API](docs/API.md) · [SECURITY](docs/SECURITY.md) · [SCALABILITY](docs/SCALABILITY.md)

### Decisions that matter

- **Classical Hybrid RAG** — retrieve → rerank → classify/generate; not agent loops or GraphRAG.
- **Parent–child chunks** — precise KPI children, section/table parents for context.
- **Incremental knowledge layer** — new PDFs match against existing facts only.
- **Cost-aware LLM use** — extract caps, cheaper extract/rerank models, heuristic short-circuit, batched classify.
- **Evolving** `fact_type` — taxonomy grows with documents.
- **Content-hash dedupe** — identical re-uploads are skipped.
- **HITL on low-confidence conflicts** — finance-safe publishing.
- **Honest failure journal** — parse/extract/match/embed issues are first-class.
- **UI** — Facts / Compare / Ask / Issues.

### Trade-offs

- Best on text-layer PDFs; scanned PDFs need an OCR lane (optional follow-on).
- LLM reranker is flexible and dependency-light; a dedicated cross-encoder can replace it behind the same interface.
- In-process workers are simple for the assignment; multi-instance production should externalize the queue ([SCALABILITY](docs/SCALABILITY.md)).

### AI tools used

- **Groq** for extract, relation classify, rerank, and Ask (`gpt-oss-20b` / `gpt-oss-120b` by role).
- **Embedding model** (OpenAI-compatible) for fact cards and evidence.
- Coding assistants (Cursor) during implementation.
- Offline shape sample: [fixtures/sample-output.json](fixtures/sample-output.json).

## Limitations and Next Steps

**Constraints:** image-only PDFs without OCR; messy table reading order; co-reference across distant pages; embedding/Groq rate limits.

**Follow-ons:** OCR lane, cross-encoder rerank swap, Postgres + pgvector + Redis workers, exportable audit packs, stronger golden eval coverage.

## Additional Notes

- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deploy: [docs/DEPLOY.md](docs/DEPLOY.md)
- Submit form prep: [docs/SUBMIT.md](docs/SUBMIT.md)
- Demo script: [docs/DEMO_CASES.md](docs/DEMO_CASES.md)
- Offline sample: [fixtures/sample-output.json](fixtures/sample-output.json)
- Starter corpus: [starter-datasets/](starter-datasets/)
- Assignment brief: `superjoin-vit-2026-assignment.pdf`

**Live demo: [https://superjoin-assignement.onrender.com/](https://superjoin-assignement.onrender.com/)**

### Pre-submit checklist

- [x] Runs from these instructions; accepts new PDFs via UI/API
- [x] Facts + evidence + hybrid Compare relations
- [x] Ask with citations (when embeddings configured)
- [x] Four required cases demonstrable (Compare + Issues)
- [x] Demo video ≤ 3 min linked above
- [x] GitHub repo submitted via [form](https://forms.gle/3fLdBQ2D6Zm2Gqtv7)
