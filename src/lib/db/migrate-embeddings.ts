import { getDb } from "./client";

/**
 * Dense vector tables for Classical Hybrid RAG.
 * Vectors stored as little-endian Float32 BLOBs (portable; no sqlite-vec required).
 */
export function migrateEmbeddings(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS fact_embeddings (
      fact_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      embedding BLOB NOT NULL,
      index_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_fact_embeddings_model
      ON fact_embeddings(model);

    CREATE TABLE IF NOT EXISTS evidence_embeddings (
      evidence_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      embedding BLOB NOT NULL,
      index_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_embeddings_model
      ON evidence_embeddings(model);
  `);
}
