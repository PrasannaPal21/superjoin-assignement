# Demo cases & video script

After the three starter PDFs are **Ready**, use the live UI — nothing is hard-coded. The pipeline is Classical Hybrid RAG (parent/child chunk → extract → embed → hybrid recall → rerank → classify / Ask).

## Reproduce

1. `GROQ_API_KEY` + embedding env in `.env` → `npm run dev`
2. Upload (any order):
   - `starter-datasets/01-delhivery-prospectus-2022-excerpt.pdf`
   - `starter-datasets/02-delhivery-annual-report-fy24-excerpt.pdf`
   - `starter-datasets/03-delhivery-q4-fy24-earnings-presentation.pdf`
3. Wait for **Ready** on each file in the sidebar (extract + embed + match finished).

| Required case | Where in the UI |
|---------------|-----------------|
| Corroboration (same fact, different wording) | **Compare** → filter **Agrees** |
| Contradiction | **Compare** → filter **Conflicts** (confirm in HITL if `needs_review`) |
| Apparent conflict explained by context | **Compare** → filter **Different context** (tags like `time`, `scope`, `units`) |
| Extraction / reasoning failure | **Issues** → Pipeline log |

**Issues → “What you can demonstrate”** shows a live checklist (`yes` / `not yet`) from `GET /api/demo-cases`.

Also show **Ask** once: e.g. “What revenue or EBITDA figures appear across these documents?” — answer must include citations (page + quote). Offline Ask goldens: `npm run smoke:ask`.

If a category is still `not yet`, wait for matching/rerank to finish or retry after rate limits cool down. Do not invent examples.

## ≤3 minute video script

| Time | Show |
|------|------|
| 0:00–0:25 | Open app → upload one starter PDF → sidebar processing → Ready |
| 0:25–0:55 | **Facts**: value-first rows → expand quote + page → filter by document |
| 0:55–1:35 | Remaining PDFs Ready → **Compare**: one Agrees + one Different context |
| 1:35–2:10 | One **Conflicts** pair with both evidence sides (+ HITL confirm if shown) |
| 2:10–2:35 | **Ask**: one question with visible citations |
| 2:35–3:00 | **Issues**: checklist + one pipeline log entry; mention hybrid RAG (retrieve → rerank → ground), incremental ingest, works on new PDFs |

Record Loom / YouTube unlisted / Drive. Paste the URL into README **Video Demo** before submitting.
