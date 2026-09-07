# Security

Auth is intentionally out of scope for this assignment. Hardening focuses on upload abuse, path safety, and LLM prompt hygiene.

## Upload threat model

| Threat | Mitigation |
|--------|------------|
| Non-PDF / polyglot upload | Extension check + `%PDF-` magic bytes |
| Path traversal in filename | Sanitize basename; store as `{uuid}.pdf` only |
| Oversized payload | `MAX_UPLOAD_MB` (default 40) |
| Upload floods | In-memory token bucket per IP key |
| Local file overwrite | Writes only under configured `UPLOAD_DIR` |

## Application hygiene

- Secrets only via env (`GROQ_API_KEY`). `.env` is gitignored; `.env.example` is tracked.
- Zod validation on LLM JSON before persistence.
- UI renders quotes as text nodes (no HTML injection from PDF content).
- `isEvalSupported: false` for pdf.js.

## Prompt injection

Document text may contain adversarial instructions. System prompts explicitly treat excerpt content as data, not commands. Control characters are stripped before prompting.

## What this does **not** claim

- No multi-tenant isolation or authentication.
- No antivirus / malware sandbox for PDF JavaScript.
- Rate limits are process-local (reset on restart; replace with Redis for multi-instance).

For production: put the app behind auth, object storage with signed uploads, and a dedicated worker fleet.
