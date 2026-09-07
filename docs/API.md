# API

Base URL: `http://localhost:3000` (dev)

All routes use the Node.js runtime.

## `GET /api/health`

Liveness + DB connectivity.

```json
{ "ok": true, "service": "fact-knowledge-layer", "dbPath": "data/factlayer.db", "dbTime": "..." }
```

## `POST /api/upload`

Multipart form field: `file` (PDF).

**201** new document queued:

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

Lists documents plus lightweight ops counters (`jobsQueued`, `jobsRunning`, `factTypes`).

## `GET /api/jobs/:id`

Job progress. Add `?by=document` to look up by document id.

## `GET /api/facts`

Query params:

- `documentId` — filter
- `factType` — evolving taxonomy filter
- `q` — substring search on claim / entity / value

Returns facts with nested evidence quotes.

## `GET /api/relations`

Query params:

- `type` — `corroborates` | `contradicts` | `reconciled`

Each relation includes side-by-side fact summaries + evidence.

## `GET /api/failures`

Failure journal entries (`parse` / `extract` / `match`).

## `GET /api/demo-cases`

Picks live examples for the four assignment demo cases from current DB state.
