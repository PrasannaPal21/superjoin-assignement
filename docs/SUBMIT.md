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
   - `README.md` has Setup, Video Demo link, Approach, Limitations, Additional Notes
   - No `.env` / secrets committed (`git status` clean of secrets)
   - `npm install && npm run build` succeeds locally
   - Prefer 25+ meaningful commits (this repo already has a full history)

2. **Demo is reproducible**
   - All three starter PDFs processed to **Ready**
   - Compare shows Agrees / Conflicts / Different context (or Issues checklist says `yes`)
   - Issues shows at least one pipeline log entry (or an honest failure)

3. **Video**
   - ≤ 3:00, follow [`DEMO_CASES.md`](DEMO_CASES.md)
   - Link pasted into README **Video Demo** section
   - Link works in an incognito window

4. **Optional but strong**
   - Live deploy URL in README Additional Notes ([`DEPLOY.md`](DEPLOY.md))
   - Sample output already in `fixtures/sample-output.json` if reviewers lack a Groq key

## Day-of checklist

- [ ] GitHub URL copied
- [ ] Video URL copied and tested
- [ ] README video placeholder replaced
- [ ] Form fields filled carefully (reg no / email typo = pain)
- [ ] Submit once; keep a screenshot of the confirmation

## What evaluators will try

- Run from your README
- Upload a **new** PDF (not only starter files)
- Look for facts + evidence + cross-doc relations
- Watch for the four cases in the video
- Read Approach + Limitations for engineering judgment
