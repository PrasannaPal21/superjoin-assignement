import { getDb } from "./client";

/** Core tables for document ingest + job queue. */
export function migrateDocumentsAndJobs(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      content_hash TEXT,
      original_filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      byte_size INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER,
      status TEXT NOT NULL DEFAULT 'uploaded',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(content_hash);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'process_document',
      status TEXT NOT NULL DEFAULT 'queued',
      progress TEXT,
      progress_current INTEGER NOT NULL DEFAULT 0,
      progress_total INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      finished_at TEXT,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_document ON jobs(document_id);
  `);
}
