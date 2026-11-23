# Deployment guide

This project is a **single Next.js app** (UI + API + Classical Hybrid RAG pipeline on one URL).

---

## Live links (Render)

| What | URL |
|------|-----|
| **Frontend + API** | https://superjoin-assignement.onrender.com/ |
| **Keep-alive** | https://superjoin-assignement.onrender.com/healthz |

The homepage is the UI; `/api/*` is the backend on the same host.

### Cron keep-alive (cron-job.org or Render Cron)

- URL: `https://superjoin-assignement.onrender.com/healthz`
- Method: **GET**
- Every **10 minutes**
- Expect HTTP **200** and JSON `{"alive":true,...}`

Prefer `/healthz` (lightweight). Do not point cron at `/`.

---

## Required environment (Render → Environment)

```
NODE_VERSION=22
GROQ_API_KEY=...
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=...
EMBEDDING_MODEL=...
DATABASE_PATH=data/factlayer.db
UPLOAD_DIR=data/uploads
```

Optional role models / RAG knobs: see [README](../README.md) Environment table (`GROQ_EXTRACT_MODEL`, `GROQ_RERANK_MODEL`, `RERANK_TOP_N`, `CONFLICT_REVIEW_THRESHOLD`, …).

---

## Render Free form settings

| Field | Value |
|-------|--------|
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Compute | Free |
| `NODE_VERSION` | `22` |

No persistent disk on Free — data resets on recycle; re-upload PDFs after sleep/redeploy.

Use lighter limits on 512 MB:

```
MAX_CONCURRENT_EXTRACTIONS=1
MAX_EXTRACT_CHUNKS=12
MAX_PAGES=120
MAX_UPLOAD_MB=25
RERANK_TOP_N=20
RERANK_TOP_M=8
MAX_MATCH_PAIRS=12
```

After changing native/runtime settings: **Manual Deploy → Clear build cache & deploy**.

---

## Verify after deploy

```bash
curl https://superjoin-assignement.onrender.com/healthz
# {"alive":true,...}

curl https://superjoin-assignement.onrender.com/api/health
# db + llm + embeddings status
```

Open https://superjoin-assignement.onrender.com/ — upload starter PDFs, wait for **Ready**, then exercise **Facts**, **Compare**, **Ask**, and **Issues**.

---

## Production-shaped follow-on (Compose)

For durable workers and pgvector at larger scale, run Postgres + Redis + object storage beside the API/worker ([SCALABILITY.md](SCALABILITY.md)). The RAG stages (chunk → extract → embed → hybrid → rerank → classify/Ask) stay the same; only I/O and queue change.
