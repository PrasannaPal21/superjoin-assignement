import { getDb } from "./client";

export function migrateFactsAndRelations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      page_start INTEGER NOT NULL,
      page_end INTEGER NOT NULL,
      text TEXT NOT NULL,
      token_estimate INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);

    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      chunk_id TEXT,
      claim TEXT NOT NULL,
      raw_value TEXT,
      numeric_value REAL,
      unit TEXT,
      period TEXT,
      scope TEXT,
      entity TEXT,
      fact_type TEXT NOT NULL DEFAULT 'other',
      confidence REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'active',
      match_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_facts_document ON facts(document_id);
    CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(fact_type);
    CREATE INDEX IF NOT EXISTS idx_facts_match_key ON facts(match_key);

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      fact_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      page INTEGER,
      quote TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_fact ON evidence(fact_id);

    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      fact_a_id TEXT NOT NULL,
      fact_b_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      rationale TEXT,
      context_tags TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fact_a_id) REFERENCES facts(id) ON DELETE CASCADE,
      FOREIGN KEY (fact_b_id) REFERENCES facts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);
    CREATE INDEX IF NOT EXISTS idx_relations_facts ON relations(fact_a_id, fact_b_id);

    CREATE TABLE IF NOT EXISTS failures (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      stage TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT,
      suggestion TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );
  `);
}
