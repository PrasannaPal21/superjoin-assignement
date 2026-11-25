import { ensureDb } from "./index";
import { getDb } from "./client";

export type ChunkRow = {
  id: string;
  document_id: string;
  page_start: number;
  page_end: number;
  text: string;
  token_estimate: number | null;
  kind: string;
  parent_id: string | null;
  section_title: string | null;
  block_kind: string | null;
  created_at: string;
};

export function getChunk(id: string): ChunkRow | null {
  ensureDb();
  return (
    (getDb()
      .prepare(`SELECT * FROM chunks WHERE id = ?`)
      .get(id) as ChunkRow | undefined) ?? null
  );
}

export function getChunksByIds(ids: string[]): ChunkRow[] {
  if (ids.length === 0) return [];
  ensureDb();
  const stmt = getDb().prepare(`SELECT * FROM chunks WHERE id = ?`);
  const out: ChunkRow[] = [];
  for (const id of ids) {
    const row = stmt.get(id) as ChunkRow | undefined;
    if (row) out.push(row);
  }
  return out;
}

/** Child chunks for a document matching an exact page span. */
export function listChildChunksByPageSpan(
  documentId: string,
  pageStart: number,
  pageEnd: number,
): ChunkRow[] {
  ensureDb();
  return getDb()
    .prepare(
      `SELECT * FROM chunks
       WHERE document_id = ?
         AND kind = 'child'
         AND page_start = ?
         AND page_end = ?
       ORDER BY created_at ASC`,
    )
    .all(documentId, pageStart, pageEnd) as ChunkRow[];
}
