import { getDb } from "./client";

/**
 * Lexical / BM25 postings for Classical Hybrid RAG (facts).
 * Token → (fact_id, tf) with per-doc length for BM25.
 */
export function migrateSparse(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS fact_sparse_docs (
      fact_id TEXT PRIMARY KEY,
      token_count INTEGER NOT NULL,
      index_text TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fact_sparse_postings (
      fact_id TEXT NOT NULL,
      token TEXT NOT NULL,
      tf INTEGER NOT NULL,
      PRIMARY KEY (fact_id, token),
      FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_fact_sparse_token
      ON fact_sparse_postings(token);
  `);
}
