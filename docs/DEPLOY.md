# Deployment guide

This project is a **single Next.js app** (UI + API on one URL).

---

## Your live links (Render)

| What | URL |
|------|-----|
| **Frontend + API (open this)** | https://superjoin-assignement.onrender.com/ |
| **Cron keep-alive** | https://superjoin-assignement.onrender.com/healthz |

There is **no separate frontend URL**. The homepage *is* the UI; `/api/*` is the backend on the same host.

### Cron job setup (cron-job.org or Render Cron)

- URL: `https://superjoin-assignement.onrender.com/healthz`
- Method: **GET**
- Every **10 minutes**
- Expect HTTP **200** and JSON `{"alive":true,...}`

Do **not** point cron at `/` (heavy). Prefer `/healthz` (no database).

---

## Fix for 502 / Segmentation fault

Free Render + native `better-sqlite3` was crashing the process (502 for browsers and cron).

The app now uses Node’s built-in **`node:sqlite`** (no native addon).

On Render → Environment set:

```
NODE_VERSION=22
```

Then **Manual Deploy → Clear build cache & deploy** (important after this change).

---

## Render Free form settings

| Field | Value |
|-------|--------|
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Compute | Free |
| `NODE_VERSION` | `22` |
| `DATABASE_PATH` | `data/factlayer.db` |
| `UPLOAD_DIR` | `data/uploads` |

No persistent disk on Free — data resets on recycle; re-upload PDFs after sleep/redeploy.

Use lighter limits on 512 MB:

```
MAX_CONCURRENT_EXTRACTIONS=1
MAX_EXTRACT_CHUNKS=12
MAX_PAGES=120
MAX_UPLOAD_MB=25
```

---

## After you push + redeploy

```bash
curl https://superjoin-assignement.onrender.com/healthz
# {"alive":true,...}

curl https://superjoin-assignement.onrender.com/api/health
# includes db + llm status
```

Open https://superjoin-assignement.onrender.com/ — should load the UI (not 502).
