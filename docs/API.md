# API

Base URL: `http://localhost:3000` (dev)

All routes use the Node.js runtime.

## `GET /api/health`

Liveness + DB + model configuration.

```json
{
  "ok": true,
  "service": "fact-knowledge-layer",
  "dbPath": "data/factlayer.db",
  "dbTime": "...",
  "llm": { "configured": true },
  "embeddings": { "configured": true }
}
```

`ok` is true when the database is reachable and required LLM/embedding credentials are present.

## `POST /api/upload`

Multipart form field: `file` (PDF).

**201** new document queued (ingest → parent/child chunk → extract → embed → hybrid match):

```json
{
  "deduped": false,
  "document": { "id": "...", "filename": "...", "byteSize": 123, "status": "queued", "contentHash": "..." },
  "job": { "id": "...", "status": "queued" }
}
```

**200** identical content already present (`deduped: true`).

Errors: `400` validation, `413` too large, `429` rate limited.

## `GET /api/documents`

Lists documents plus ops counters (`jobsQueued`, `jobsRunning`, `factTypes`).

## `GET /api/jobs/:id`

Job progress (`parsing` → `extracting` → `embedding` → `matching` → done). Add `?by=document` to look up by document id.

## `GET /api/facts`

Query params:

- `documentId` — filter
- `factType` — evolving taxonomy filter
- `q` — substring search on claim / entity / value

Returns facts with nested evidence quotes.

## `GET /api/relations`

Query params:

- `type` — `corroborates` | `contradicts` | `reconciled`
- `reviewStatus` — `auto_accepted` | `needs_review` | `confirmed` | `rejected`

Each relation includes side-by-side fact summaries + evidence + `review_status`.

## `POST /api/relations/:id/review`

HITL action for low-confidence conflicts.

```json
{ "decision": "confirmed" }
```

or `{ "decision": "rejected" }`.

## `POST /api/ask`

Classical grounded Ask over the hybrid index.

```json
{ "question": "What revenue figures appear across documents?" }
```

**200** example:

```json
{
  "answer": "...",
  "citations": [
    { "factId": "...", "page": 12, "quote": "...", "documentId": "..." }
  ],
  "refused": false
}
```

When retrieval confidence is low: `{ "refused": true, "reason": "..." }`.

## `GET /api/failures`

Failure journal entries (`parse` / `extract` / `embed` / `match` / `rerank`).

## `GET /api/demo-cases`

Live picks for the four assignment demo cases from current DB state.

## `POST /api/rematch`

Rebuild relations from stored facts (re-run hybrid recall → rerank → classify). Does not re-extract.

## `POST /api/reprocess`

Clear knowledge for selected/all documents and re-queue full ingest (extract + embed + match).
