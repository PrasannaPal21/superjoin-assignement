# Architecture

## Goal

Turn uploaded PDFs into a **fact knowledge layer**: grounded claims with evidence, then cross-document relations (`corroborates`, `contradicts`, `reconciled`).

The design is document-agnostic. Nothing in the extractor hard-codes Delhivery filenames, metrics, or schemas. New PDFs extend the layer incrementally.

## Components

```
UI (Next.js) → API routes → SQLite job queue → in-process worker
                                      ↓
                         parse → chunk → Groq extract → match
                                      ↓
                              facts + evidence + relations
```

### Storage (SQLite)

| Table | Role |
|-------|------|
| `documents` | Upload metadata, content hash, status |
| `jobs` | Queue + progress checkpoints |
| `chunks` | Page-range text units |
| `facts` | Normalized claims (`fact_type` is free-form and evolves) |
| `evidence` | Quote + page grounding |
| `relations` | Pairwise cross-doc links |
| `failures` | Honest failure journal |

SQLite keeps local setup zero-ops. Schema is relational and maps cleanly to Postgres later (see `SCALABILITY.md`).

### Pipeline stages

1. **Validate & store** — extension, MIME, magic bytes, size cap, SHA-256 hash.
2. **Parse** — pdf.js per-page text. Image-only pages are recorded in the failure journal (no OCR in v1).
3. **Chunk** — contiguous page groups (`CHUNK_PAGES`, default 3) with a soft character cap.
4. **Extract** — Groq JSON extraction with schema validation, JSON repair, and one retry.
5. **Match** — candidate pairs via `match_key` + claim similarity, then LLM classification.
6. **Persist relations** — only non-`unrelated` outcomes.

New documents match **against existing facts only**. Older documents are not re-extracted.

### LLM boundary

- Provider: Groq (OpenAI-compatible).
- PDF text is treated as **untrusted data** (prompt-injection hygiene).
- Structured outputs validated with Zod.

### UI

Single-page app: upload → documents → facts → relations → demo cases → failure journal.

Visual pieces borrow patterns from Kokonut-style loaders, Bklit-style overview bars, and light Motion accents — without turning the page into a dashboard collage.
