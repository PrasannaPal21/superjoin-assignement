# Demo cases & video script

After the three starter PDFs are **Ready**, use the live UI — nothing is hard-coded.

## Reproduce

1. `GROQ_API_KEY` in `.env` → `npm run dev`
2. Upload (any order):
   - `starter-datasets/01-delhivery-prospectus-2022-excerpt.pdf`
   - `starter-datasets/02-delhivery-annual-report-fy24-excerpt.pdf`
   - `starter-datasets/03-delhivery-q4-fy24-earnings-presentation.pdf`
3. Wait for **Ready** on each file in the sidebar.

| Required case | Where in the UI |
|---------------|-----------------|
| Corroboration (same fact, different wording) | **Compare** → filter **Agrees** |
| Contradiction | **Compare** → filter **Conflicts** |
| Apparent conflict explained by context | **Compare** → filter **Different context** (tags like `time`, `scope`, `units`) |
| Extraction / reasoning failure | **Issues** → Pipeline log |

**Issues → “What you can demonstrate”** shows a live checklist (`yes` / `not yet`) from `GET /api/demo-cases`.

If a category is still `not yet`, wait for matching to finish or re-upload after rate limits cool down. Do not invent examples.

## ≤3 minute video script

| Time | Show |
|------|------|
| 0:00–0:25 | Open app → upload one starter PDF → sidebar moves to processing → Ready |
| 0:25–0:55 | **Facts**: value-first rows → expand one row for quote + page → filter by document |
| 0:55–1:40 | Upload remaining PDFs (or show already Ready) → **Compare**: one Agrees + one Different context |
| 1:40–2:20 | One **Conflicts** pair with both evidence sides |
| 2:20–2:45 | **Issues**: checklist + one pipeline log entry and what you’d improve |
| 2:45–3:00 | Mention: incremental ingest, content-hash dedupe, works on new PDFs (not Delhivery-only) |

Record Loom / YouTube unlisted / Drive. Paste the URL into README **Video Demo** before submitting.
