# Fact Knowledge Layer

Grounded fact extraction across PDFs — every claim linked to evidence, with cross-document **corroboration**, **contradiction**, and **context-aware reconciliation**.

Built for the Superjoin VIT 2026 Engineering Intern assignment. The pipeline is **general**: it does not hard-code Delhivery facts, filenames, or schemas. Drop in other PDFs and the knowledge layer grows incrementally.

## Setup and Run Instructions

### Prerequisites

- Node.js 20+ (tested on 22)
- A [Groq](https://console.groq.com/) API key

### Install

```bash
cp .env.example .env
# put your key in .env → GROQ_API_KEY=...

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Quick API check

```bash
curl http://localhost:3000/api/health
```

### Process the starter dataset

Upload the three files under `starter-datasets/` via the UI (or `POST /api/upload` with multipart field `file`). Watch document status move to `ready`, then explore Facts, Relations, Demo Cases, and the Failure Journal.

```bash
npm test   # unit tests (no API key required)
```

### Environment

| Variable | Purpose | Default |
|----------|---------|---------|
| `GROQ_API_KEY` | Required for extraction/matching | — |
| `GROQ_MODEL` | Chat model | `openai/gpt-oss-120b` |
| `GROQ_FALLBACK_MODELS` | Comma-separated fallbacks on model_not_found | `openai/gpt-oss-20b` |
| `MAX_UPLOAD_MB` | Upload size cap | `40` |
| `MAX_PAGES` | Pages processed per PDF | `500` |
| `CHUNK_PAGES` | Pages per LLM chunk | `3` |
| `MAX_CONCURRENT_JOBS` | Parallel documents | `1` |
| `MAX_CONCURRENT_EXTRACTIONS` | Parallel chunk calls | `2` |

Never commit real keys. Deploy by injecting `GROQ_API_KEY` in the host env.

## Video Demo

> **TODO for submitter:** record ≤ 3 minutes and paste the link here (Loom / YouTube unlisted / Drive).

Suggested script: [docs/DEMO_CASES.md](docs/DEMO_CASES.md).

## Approach

### Problem framing

Important claims in filings are scattered, restated, or contradicted. A useful system must (1) extract facts, (2) ground them in quotes/pages, and (3) explain how facts relate across documents — including when an apparent conflict is really a difference in time, scope, or units.

### Architecture

Next.js (App Router) hosts both UI and API. Uploads land on disk + SQLite. An in-process worker runs:

**parse → chunk → Groq extract → candidate match → classify relations**

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/API.md](docs/API.md) · [docs/SCALABILITY.md](docs/SCALABILITY.md)

### Important decisions

- **SQLite + job table** instead of Redis so reviewers can run with zero extra services.
- **Incremental ingest** — new PDFs match against existing facts; no full rebuild.
- **Evolving `fact_type`** strings instead of a fixed ontology.
- **Content-hash dedupe** so re-uploads are cheap.
- **Failure journal** as a first-class artifact (assignment asks for an honest failure case).
- **Hybrid UI**: simple single-column flow; Kokonut-style loader, Bklit-inspired relation bars, light Motion — not a graph-database demo.

### Trade-offs

- Accuracy depends on text-layer PDFs and LLM judgment; scanned pages need OCR (called out in Limitations).
- Candidate recall uses lexical/`match_key` heuristics before LLM classification — cheaper than embedding everything up front, but can miss paraphrases.
- In-process workers are fine for a prototype; multi-instance deploys should externalize the queue.

### AI tools used

- **Groq** (`openai/gpt-oss-120b` by default, with fallbacks) for structured fact extraction and relation classification.
- Coding assistants during implementation (Cursor). Pipeline behavior is deterministic given the same model outputs; fixtures under `fixtures/` help offline review.

## Limitations and Next Steps

**Does not work well yet**

- Image-only / scanned PDFs (no OCR lane).
- Extremely dense tables where pdf.js reading order is poor.
- Ambiguous co-reference (“the Company”, “he”) without wider document context windows.
- Relation coverage depends on candidate generation quality and rate limits.

**Would build next**

- OCR fallback, embedding-based candidate recall, Postgres + Redis workers, optional human-in-the-loop confirmation on low-confidence contradictions, and exportable audit packs per document set.

## Additional Notes

- Security posture (no auth): [docs/SECURITY.md](docs/SECURITY.md)
- Offline sample shape: [fixtures/sample-output.json](fixtures/sample-output.json)
- Assignment PDF kept at repo root for reference; starter corpus in `starter-datasets/`.
- Brownie targets covered: large-PDF chunking, multi-doc layer, evolving types, incremental ingest without rebuild.

### Submission checklist

- [x] Runs from these instructions; accepts new PDFs via UI/API
- [x] Results include facts, evidence, and cross-document relations
- [x] Demo Cases + Failure Journal surface the four required cases
- [ ] Demo video ≤ 3 min linked above
- [ ] GitHub repo shared via [submission form](https://forms.gle/3fLdBQ2D6Zm2Gqtv7)
