# Deployment guide

This project is a **single Next.js app**: the UI and the API live together. You do **not** deploy a separate frontend and backend unless you choose to split later.

```
Browser  →  Next.js (pages + /api/*)  →  SQLite + uploads on disk  →  Groq
```

---

## Recommended: Render Web Service (UI + API together)

Best fit for “backend that must stay warm” + one URL for reviewers.

### 1. Push to GitHub

Public repo (or shared with Superjoin). Do not commit `.env`.

### 2. Create a Web Service

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**
2. Connect the GitHub repo
3. Settings:

| Setting | Value |
|---------|--------|
| Runtime | Node |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Instance | Free or Starter |

`better-sqlite3` needs a native compile during `npm install` — Render’s Node image handles this.

### 3. Environment variables

In Render → Environment:

```
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-120b
GROQ_EXTRACT_MODEL=openai/gpt-oss-20b
GROQ_MATCH_MODEL=openai/gpt-oss-120b
NODE_VERSION=20
```

Optional knobs (same as `.env.example`): `MAX_EXTRACT_CHUNKS`, `CHUNK_PAGES`, etc.

### 4. Persistent disk (important)

Free/ephemeral disks **wipe SQLite and uploads** on redeploy/restart.

1. Render → your service → **Disks** → Add disk  
2. Mount path: `/var/data`  
3. Add env:

```
DATABASE_PATH=/var/data/factlayer.db
UPLOAD_DIR=/var/data/uploads
```

Without a disk, the app still runs, but knowledge resets when the instance recycles.

### 5. Deploy

Render builds and serves `https://YOUR-SERVICE.onrender.com` — that one URL is both frontend and API.

Smoke test:

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
```

---

## Keep-alive cron (stop Render free-tier spin-down)

Free Render web services sleep after ~15 minutes of idle traffic. A scheduled **GET** to your health endpoint keeps the process warm.

### Where to point the cron

```
https://YOUR-SERVICE.onrender.com/api/health
```

Method: **GET**  
Interval: every **10–14 minutes** (safer than 15+)

That path is cheap (DB ping + config check) and already used by the UI.

### Option A — cron-job.org (simplest)

1. Sign up at [https://cron-job.org](https://cron-job.org)
2. Create job:
   - URL: `https://YOUR-SERVICE.onrender.com/api/health`
   - Schedule: every 10 minutes
   - Enable the job
3. Confirm execution history shows HTTP 200

### Option B — Render Cron Job

1. Render → **New** → **Cron Job**
2. Schedule: `*/10 * * * *` (every 10 minutes)
3. Command:

```bash
curl -fsS https://YOUR-SERVICE.onrender.com/api/health
```

Use the **same** public URL as your Web Service. The cron does not replace the web service — it only pings it.

### Option C — GitHub Actions (optional)

```yaml
# .github/workflows/keepalive.yml
name: keepalive
on:
  schedule:
    - cron: "*/12 * * * *"
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS "${{ secrets.APP_URL }}/api/health"
```

Store `APP_URL=https://YOUR-SERVICE.onrender.com` as a repo secret (no trailing slash).

---

## Alternative: Vercel (frontend-friendly, caveats)

Vercel is excellent for Next.js UI, but:

- **Ephemeral filesystem** — SQLite + local uploads do **not** persist well on serverless
- Long PDF jobs can hit **function timeouts**
- Native modules like `better-sqlite3` are awkward on serverless

Use Vercel only if you also move storage to Postgres + object storage (S3). For this assignment prototype, **Render Web Service + disk** is the practical choice.

If you still want Vercel for a static preview only, do not expect the full pipeline to survive cold starts without a real database.

---

## “Separate frontend and backend?”

| Approach | When |
|----------|------|
| **One Render Web Service** (this repo) | Recommended for submission |
| Split later | Next.js UI on Vercel + API worker on Render with shared Postgres/Redis |

Today the API routes (`/api/upload`, `/api/facts`, …) are part of the same Next process as the UI. Deploy once.

---

## Post-deploy checklist

- [ ] `/api/health` returns `ok: true` and `llm.configured: true`
- [ ] Upload a small PDF from the UI
- [ ] Document reaches **Ready**
- [ ] Cron hits `/api/health` every ~10 minutes
- [ ] Put the live URL in README **Additional Notes**
