import { getDb } from "./client";

function columnNames(table: string): Set<string> {
  const db = getDb();
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

function addColumnIfMissing(
  table: string,
  column: string,
  ddlType: string,
): void {
  const cols = columnNames(table);
  if (cols.has(column)) return;
  getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
}

/**
 * Parent/child chunk hierarchy columns (Classical Hybrid RAG).
 * Safe to re-run: CREATE IF NOT EXISTS + additive ALTERs.
 */
export function migrateChunkHierarchy(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      page_start INTEGER NOT NULL,
      page_end INTEGER NOT NULL,
      text TEXT NOT NULL,
      token_estimate INTEGER,
      kind TEXT NOT NULL DEFAULT 'flat',
      parent_id TEXT,
      section_title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES chunks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
  `);

  // Existing DBs created before hierarchy fields.
  addColumnIfMissing("chunks", "kind", `TEXT NOT NULL DEFAULT 'flat'`);
  addColumnIfMissing("chunks", "parent_id", `TEXT`);
  addColumnIfMissing("chunks", "section_title", `TEXT`);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chunks_kind ON chunks(kind);
    CREATE INDEX IF NOT EXISTS idx_chunks_parent ON chunks(parent_id);
  `);
}
