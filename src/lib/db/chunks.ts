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
