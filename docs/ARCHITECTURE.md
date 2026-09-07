# Architecture

## Goal

Turn uploaded PDFs into a **fact knowledge layer**: grounded claims with evidence, then cross-document relations (`corroborates` / Agrees, `contradicts` / Conflicts, `reconciled` / Different context).

Document-agnostic: no hard-coded company facts, filenames, or schemas. New PDFs extend the layer incrementally.

## Components

```
UI (Next.js) → API routes → SQLite job queue → in-process worker
                                      ↓
              parse → signal-aware chunk → Groq extract → match
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

Zero-ops locally; schema maps cleanly to Postgres later ([SCALABILITY.md](SCALABILITY.md)).

### Pipeline stages

1. **Validate & store** — extension, MIME, magic bytes, size cap, SHA-256 hash (dedupe).
2. **Parse** — pdf.js per-page text. Sparse/image pages land in the failure journal (no OCR in v1).
3. **Chunk** — high-signal pages packed by page/char budget (`CHUNK_PAGES`, `CHUNK_CHAR_BUDGET`), capped by `MAX_EXTRACT_CHUNKS`.
4. **Extract** — Groq JSON (`GROQ_EXTRACT_MODEL`, default cheaper 20b) with Zod + JSON repair + one retry; max ~12 facts / chunk.
5. **Match** — candidate pairs (`match_key` + similarity), capped by `MAX_MATCH_PAIRS`.
6. **Classify** — heuristics for clear numeric/period cases; batched LLM for the rest (`MATCH_BATCH_SIZE`).
7. **Persist** — only non-`unrelated` relations.

New documents match **against existing facts only**. Older documents are not re-extracted.

### LLM boundary

- Provider: Groq (OpenAI-compatible).
- PDF text treated as **untrusted data**.
- Structured outputs validated with Zod.

### UI

Document rail + **Facts** (ledger) / **Compare** (plain-language relations) / **Issues** (demo coverage + pipeline log).
