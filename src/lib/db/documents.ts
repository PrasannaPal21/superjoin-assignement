import { getDb } from "./client";
import { ensureDb } from "./index";

export type DocumentRow = {
  id: string;
  content_hash: string | null;
  original_filename: string;
  stored_path: string;
  mime_type: string;
  byte_size: number;
  page_count: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type JobRow = {
  id: string;
  document_id: string;
  type: string;
  status: string;
  progress: string | null;
  progress_current: number;
  progress_total: number;
  error_message: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export function insertDocument(doc: {
  id: string;
  original_filename: string;
  stored_path: string;
  mime_type?: string;
  byte_size: number;
  content_hash?: string | null;
  status?: string;
}): DocumentRow {
  ensureDb();
  const db = getDb();
  db.prepare(
    `INSERT INTO documents (
      id, content_hash, original_filename, stored_path, mime_type, byte_size, status
    ) VALUES (@id, @content_hash, @original_filename, @stored_path, @mime_type, @byte_size, @status)`,
  ).run({
    id: doc.id,
    content_hash: doc.content_hash ?? null,
    original_filename: doc.original_filename,
    stored_path: doc.stored_path,
    mime_type: doc.mime_type ?? "application/pdf",
    byte_size: doc.byte_size,
    status: doc.status ?? "uploaded",
  });
  return getDocument(doc.id)!;
}

export function getDocument(id: string): DocumentRow | undefined {
  ensureDb();
  return getDb().prepare("SELECT * FROM documents WHERE id = ?").get(id) as
    | DocumentRow
    | undefined;
}

export function listDocuments(): DocumentRow[] {
  ensureDb();
  return getDb()
    .prepare("SELECT * FROM documents ORDER BY created_at DESC")
    .all() as DocumentRow[];
}

export function updateDocumentStatus(
  id: string,
  status: string,
  extra?: { page_count?: number; error_message?: string | null },
): void {
  ensureDb();
  getDb()
    .prepare(
      `UPDATE documents SET
        status = @status,
        page_count = COALESCE(@page_count, page_count),
        error_message = @error_message,
        updated_at = datetime('now')
      WHERE id = @id`,
    )
    .run({
      id,
      status,
      page_count: extra?.page_count ?? null,
      error_message: extra?.error_message ?? null,
    });
}

export function insertJob(job: {
  id: string;
  document_id: string;
  type?: string;
}): JobRow {
  ensureDb();
  getDb()
    .prepare(
      `INSERT INTO jobs (id, document_id, type, status)
       VALUES (@id, @document_id, @type, 'queued')`,
    )
    .run({
      id: job.id,
      document_id: job.document_id,
      type: job.type ?? "process_document",
    });
  return getJob(job.id)!;
}

export function getJob(id: string): JobRow | undefined {
  ensureDb();
  return getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
}

export function getDocumentByHash(contentHash: string): DocumentRow | undefined {
  ensureDb();
  return getDb()
    .prepare(
      `SELECT * FROM documents WHERE content_hash = ? AND status != 'failed'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(contentHash) as DocumentRow | undefined;
}

export function getLatestJobForDocument(documentId: string): JobRow | undefined {
  ensureDb();
  return getDb()
    .prepare(
      `SELECT * FROM jobs WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(documentId) as JobRow | undefined;
}

