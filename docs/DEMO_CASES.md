# Demo cases

After processing the three starter PDFs in `starter-datasets/`, open the UI section **Required demo cases**. It loads live examples from `GET /api/demo-cases`.

## How to reproduce

1. Set `GROQ_API_KEY` in `.env`.
2. `npm run dev`
3. Upload, in any order:
   - `01-delhivery-prospectus-2022-excerpt.pdf`
   - `02-delhivery-annual-report-fy24-excerpt.pdf`
   - `03-delhivery-q4-fy24-earnings-presentation.pdf`
4. Wait until each document status is `ready` (status polls every few seconds).
5. Walk the four panels:

| Case | Where to look |
|------|----------------|
| Corroboration | Relation type `corroborates` — same claim, different wording/docs |
| Contradiction | Relation type `contradicts` — conflicting values/roles |
| Reconciled | Relation type `reconciled` — tags like `time`, `scope`, `units` |
| Failure | Failure journal — empty pages, schema retries, match errors |

## Notes for the video (≤ 3 minutes)

1. Upload one PDF, show job progress.
2. Open a fact with evidence quote.
3. Show one corroboration and one reconciled card side-by-side.
4. Show contradiction + failure journal entry.
5. Briefly mention incremental ingest + hash dedupe.

If a relation type is missing after one run, upload another starter PDF or re-check matching once Groq rate limits cool down. The demo panel updates from the database — it does not invent examples.
