# Submission form — what to prepare

Form: https://forms.gle/3fLdBQ2D6Zm2Gqtv7

## Fields you will fill

| Field | Prepare |
|-------|---------|
| **Full name** | As on your VIT records |
| **VIT registration number** | Exact reg no. |
| **VIT email address** | College email |
| **GitHub repository URL** | Public (or accessible to Superjoin) repo with this project on `main` |
| **Demo video URL (3 minutes or less)** | Loom / YouTube unlisted / Drive link that opens without login friction |

## Before you open the form

1. **Repo is ready**
   - `README.md` has Setup, Video Demo link, Approach (Classical Hybrid RAG), Limitations, Additional Notes
   - Docs describe the hybrid RAG pipeline: [RAG_ARCHITECTURE.md](RAG_ARCHITECTURE.md), [ARCHITECTURE.md](ARCHITECTURE.md)
   - No `.env` / secrets committed (`git status` clean of secrets)
   - `npm install && npm run build` succeeds locally
   - Prefer 25+ meaningful commits

2. **Demo is reproducible**
   - All three starter PDFs processed to **Ready** (extract + embed + match)
   - Compare shows Agrees / Conflicts / Different context (or Issues checklist says `yes`)
   - Ask returns a cited answer (or an honest refuse)
   - Issues shows at least one pipeline log entry (or an honest failure)

3. **Video**
   - ≤ 3:00, follow [`DEMO_CASES.md`](DEMO_CASES.md)
   - Link pasted into README **Video Demo** section
   - Link works in an incognito window

4. **Optional but strong**
   - Live deploy URL in README Additional Notes ([`DEPLOY.md`](DEPLOY.md))
   - Sample output in `fixtures/sample-output.json` if reviewers lack API keys
   - `npm run eval` (runs offline hybrid + classify + ask smokes)

## Day-of checklist

- [ ] GitHub URL copied
- [ ] Video URL copied and tested
- [ ] README video placeholder replaced
- [ ] Form fields filled carefully (reg no / email typo = pain)
- [ ] Submit once; keep a screenshot of the confirmation

## What evaluators will try

- Run from your README
- Upload a **new** PDF (not only starter files)
- Look for facts + evidence + hybrid cross-doc relations
- Try Ask with citations when embeddings are configured
- Watch for the four cases in the video
- Read Approach + Limitations for engineering judgment (Classical Hybrid RAG narrative)
