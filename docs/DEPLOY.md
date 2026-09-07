# Deployment guide

This project is a **single Next.js app** (UI + API together). One Render Web Service is enough.

```
Browser  →  Next.js (pages + /api/*)  →  SQLite + uploads on disk  →  Groq
```

---

## Render Free tier — exact form settings

Free instances **do not support persistent disks**. That is fine for the assignment if you accept:

- SQLite + uploaded PDFs live on **ephemeral** disk  
- Data is **wiped** on redeploy / sleep recycle  
- Re-upload starter PDFs after a cold recycle when demoing live  

Paid plans ($7+) unlock disks if you need persistence later.

### Fields to set

| Field | Use this |
|-------|----------|
| Language | Node |
| Branch | `main` |
| Region | Closest to you (e.g. Singapore) |
| Root Directory | *(leave empty)* |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Compute | **Free** is OK for submission |
| Health Check Path | `/healthz` **or** `/api/health` (both work) |
| Auto-Deploy | On Commit |

### Environment variables (Free tier)

**Do set**

```
NODE_VERSION=20
GROQ_API_KEY=...your key...
GROQ_MODEL=openai/gpt-oss-120b
GROQ_EXTRACT_MODEL=openai/gpt-oss-20b
GROQ_MATCH_MODEL=openai/gpt-oss-120b
GROQ_FALLBACK_MODELS=openai/gpt-oss-20b
```

**Use these lighter knobs on 512 MB RAM** (avoids OOM on big PDFs):

```
MAX_UPLOAD_MB=25
MAX_PAGES=120
CHUNK_PAGES=8
CHUNK_CHAR_BUDGET=10000
MAX_EXTRACT_CHUNKS=12
MAX_MATCH_PAIRS=12
MATCH_BATCH_SIZE=6
MAX_CONCURRENT_JOBS=1
MAX_CONCURRENT_EXTRACTIONS=1
DATABASE_PATH=data/factlayer.db
UPLOAD_DIR=data/uploads
```

**Do not** set `DATABASE_PATH=/var/data/...` on Free — there is no mounted disk; relative `data/...` paths are correct.

### After deploy

```bash
curl https://YOUR-SERVICE.onrender.com/healthz
curl https://YOUR-SERVICE.onrender.com/api/health
```

Both should return JSON with `"alive": true`. Open the site URL and upload a PDF.

---

## Keep-alive cron (Free tier sleep)

Free services sleep after ~15 minutes idle.

**Point the cron at:**

```text
GET https://YOUR-SERVICE.onrender.com/healthz
```

(or `/api/health` — same handler)

Every **10–12 minutes**.

Easiest: [cron-job.org](https://cron-job.org) → create job with that URL.

Render Cron Job alternative:

```bash
curl -fsS https://YOUR-SERVICE.onrender.com/healthz
```

Schedule: `*/10 * * * *`

---

## If you upgrade later (paid + disk)

1. Pick a paid compute plan that lists **persistent disks**
2. Add disk mount `/var/data`
3. Change env:

```
DATABASE_PATH=/var/data/factlayer.db
UPLOAD_DIR=/var/data/uploads
```

4. Redeploy

---

## Vercel?

Not recommended for this assignment prototype: no durable local SQLite/uploads and short serverless timeouts. Prefer Render Web Service.

---

## Post-deploy checklist

- [ ] `/healthz` returns 200
- [ ] UI loads
- [ ] Upload starter PDF → reaches Ready (may take a few minutes on Free CPU)
- [ ] Cron hitting `/healthz` every ~10 minutes
- [ ] Live URL noted in README Additional Notes
- [ ] After a redeploy, re-upload demo PDFs (Free = ephemeral storage)
