# Security

Hardening focuses on upload abuse, path safety, secret handling, and LLM / RAG prompt hygiene. Full multi-tenant SaaS auth is a documented scale-out step ([SCALABILITY.md](SCALABILITY.md)).

## Upload threat model

| Threat | Mitigation |
|--------|------------|
| Non-PDF / polyglot upload | Extension check + `%PDF-` magic bytes |
| Path traversal in filename | Sanitize basename; store as `{uuid}.pdf` only |
| Oversized payload | `MAX_UPLOAD_MB` (default 40) |
| Upload floods | Token bucket per IP key |
| Local file overwrite | Writes only under configured `UPLOAD_DIR` |

## Application hygiene

- Secrets only via env (`GROQ_API_KEY`, `EMBEDDING_API_KEY`, …). `.env` is gitignored; `.env.example` is tracked.
- Zod validation on LLM JSON (extract, classify, rerank, Ask) before persistence.
- UI renders quotes and Ask citations as text nodes (no HTML injection from PDF content).
- `isEvalSupported: false` for pdf.js.

## Prompt injection (RAG-specific)

Document text and retrieved evidence may contain adversarial instructions.

- System prompts treat excerpt / evidence as **data**, not commands.
- Control characters are stripped; long excerpts truncated before prompting.
- Ask generation is instructed to answer **only** from the supplied context pack and to refuse when unsupported.
- Structured outputs (facts, relations, rerank scores) are schema-validated — free-form model text is not executed.

## Retrieval & publish safety

- Compare candidates are reranked; weak pairs are dropped before classify.
- Low-confidence `contradicts` go to HITL (`needs_review`) before counting as confirmed.
- Ask refuses when hybrid retrieval confidence is insufficient.

## What this does **not** claim

- No antivirus / malware sandbox for PDF JavaScript.
- Rate limits are process-local by default (use Redis for multi-instance).
- Production multi-tenant isolation requires auth + `tenant_id` scoping on all queries.

For production: put the app behind auth, object storage with signed uploads, a dedicated worker fleet, and tenant-scoped indexes.
