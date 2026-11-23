import { ensureDb } from "@/lib/db";
import { getDb } from "@/lib/db/client";

export type SparseDocRow = {
  fact_id: string;
  token_count: number;
  index_text: string | null;
  updated_at: string;
};

export type SparsePostingRow = {
  fact_id: string;
  token: string;
  tf: number;
};

/** Replace all postings for a fact (delete + insert). */
export function upsertFactSparseIndex(opts: {
  factId: string;
  tokenCount: number;
  indexText: string;
  termFrequencies: Map<string, number> | Record<string, number>;
}): void {
  ensureDb();
  const db = getDb();
  const entries =
    opts.termFrequencies instanceof Map
      ? [...opts.termFrequencies.entries()]
      : Object.entries(opts.termFrequencies);

  const del = db.prepare(`DELETE FROM fact_sparse_postings WHERE fact_id = ?`);
  const upsertDoc = db.prepare(
    `INSERT INTO fact_sparse_docs (fact_id, token_count, index_text, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(fact_id) DO UPDATE SET
       token_count = excluded.token_count,
       index_text = excluded.index_text,
       updated_at = datetime('now')`,
  );
  const insertPosting = db.prepare(
    `INSERT INTO fact_sparse_postings (fact_id, token, tf) VALUES (?, ?, ?)`,
  );

  db.exec("BEGIN");
  try {
    del.run(opts.factId);
    upsertDoc.run(opts.factId, opts.tokenCount, opts.indexText);
    for (const [token, tf] of entries) {
      if (!token || tf <= 0) continue;
      insertPosting.run(opts.factId, token, tf);
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function deleteFactSparseIndex(factId: string): void {
  ensureDb();
  const db = getDb();
  db.prepare(`DELETE FROM fact_sparse_postings WHERE fact_id = ?`).run(factId);
  db.prepare(`DELETE FROM fact_sparse_docs WHERE fact_id = ?`).run(factId);
}

export function getFactSparseDoc(factId: string): SparseDocRow | null {
  ensureDb();
  return (
    (getDb()
      .prepare(`SELECT * FROM fact_sparse_docs WHERE fact_id = ?`)
      .get(factId) as SparseDocRow | undefined) ?? null
  );
}

export function countSparseDocs(opts?: {
  excludeDocumentId?: string;
}): number {
  ensureDb();
  if (opts?.excludeDocumentId) {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM fact_sparse_docs d
         JOIN facts f ON f.id = d.fact_id
         WHERE f.status = 'active' AND f.document_id != ?`,
      )
      .get(opts.excludeDocumentId) as { n: number };
    return row.n;
  }
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM fact_sparse_docs d
       JOIN facts f ON f.id = d.fact_id
       WHERE f.status = 'active'`,
    )
    .get() as { n: number };
  return row.n;
}

export function averageSparseDocLength(opts?: {
  excludeDocumentId?: string;
}): number {
  ensureDb();
  if (opts?.excludeDocumentId) {
    const row = getDb()
      .prepare(
        `SELECT AVG(d.token_count) AS avgdl FROM fact_sparse_docs d
         JOIN facts f ON f.id = d.fact_id
         WHERE f.status = 'active' AND f.document_id != ?`,
      )
      .get(opts.excludeDocumentId) as { avgdl: number | null };
    return row.avgdl && row.avgdl > 0 ? row.avgdl : 1;
  }
  const row = getDb()
    .prepare(
      `SELECT AVG(d.token_count) AS avgdl FROM fact_sparse_docs d
       JOIN facts f ON f.id = d.fact_id
       WHERE f.status = 'active'`,
    )
    .get() as { avgdl: number | null };
  return row.avgdl && row.avgdl > 0 ? row.avgdl : 1;
}

/** Document frequency: how many active facts contain the token. */
export function documentFrequency(
  token: string,
  opts?: { excludeDocumentId?: string },
): number {
  ensureDb();
  if (opts?.excludeDocumentId) {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM fact_sparse_postings p
         JOIN facts f ON f.id = p.fact_id
         WHERE p.token = ? AND f.status = 'active' AND f.document_id != ?`,
      )
      .get(token, opts.excludeDocumentId) as { n: number };
    return row.n;
  }
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM fact_sparse_postings p
       JOIN facts f ON f.id = p.fact_id
       WHERE p.token = ? AND f.status = 'active'`,
    )
    .get(token) as { n: number };
  return row.n;
}

export function listPostingsForToken(
  token: string,
  opts?: { excludeDocumentId?: string },
): Array<{ fact_id: string; tf: number; token_count: number }> {
  ensureDb();
  if (opts?.excludeDocumentId) {
    return getDb()
      .prepare(
        `SELECT p.fact_id, p.tf, d.token_count
         FROM fact_sparse_postings p
         JOIN fact_sparse_docs d ON d.fact_id = p.fact_id
         JOIN facts f ON f.id = p.fact_id
         WHERE p.token = ? AND f.status = 'active' AND f.document_id != ?`,
      )
      .all(token, opts.excludeDocumentId) as Array<{
      fact_id: string;
      tf: number;
      token_count: number;
    }>;
  }
  return getDb()
    .prepare(
      `SELECT p.fact_id, p.tf, d.token_count
       FROM fact_sparse_postings p
       JOIN fact_sparse_docs d ON d.fact_id = p.fact_id
       JOIN facts f ON f.id = p.fact_id
       WHERE p.token = ? AND f.status = 'active'`,
    )
    .all(token) as Array<{
    fact_id: string;
    tf: number;
    token_count: number;
  }>;
}

// --- Evidence sparse (Ask) ---

export type EvidenceSparseDocRow = {
  evidence_id: string;
  token_count: number;
  index_text: string | null;
  updated_at: string;
};

export function upsertEvidenceSparseIndex(opts: {
  evidenceId: string;
  tokenCount: number;
  indexText: string;
  termFrequencies: Map<string, number> | Record<string, number>;
}): void {
  ensureDb();
  const db = getDb();
  const entries =
    opts.termFrequencies instanceof Map
      ? [...opts.termFrequencies.entries()]
      : Object.entries(opts.termFrequencies);

  const del = db.prepare(
    `DELETE FROM evidence_sparse_postings WHERE evidence_id = ?`,
  );
  const upsertDoc = db.prepare(
    `INSERT INTO evidence_sparse_docs (evidence_id, token_count, index_text, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(evidence_id) DO UPDATE SET
       token_count = excluded.token_count,
       index_text = excluded.index_text,
       updated_at = datetime('now')`,
  );
  const insertPosting = db.prepare(
    `INSERT INTO evidence_sparse_postings (evidence_id, token, tf) VALUES (?, ?, ?)`,
  );

  db.exec("BEGIN");
  try {
    del.run(opts.evidenceId);
    upsertDoc.run(opts.evidenceId, opts.tokenCount, opts.indexText);
    for (const [token, tf] of entries) {
      if (!token || tf <= 0) continue;
      insertPosting.run(opts.evidenceId, token, tf);
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function getEvidenceSparseDoc(
  evidenceId: string,
): EvidenceSparseDocRow | null {
  ensureDb();
  return (
    (getDb()
      .prepare(`SELECT * FROM evidence_sparse_docs WHERE evidence_id = ?`)
      .get(evidenceId) as EvidenceSparseDocRow | undefined) ?? null
  );
}

export function countEvidenceSparseDocs(opts?: {
  excludeDocumentId?: string;
}): number {
  ensureDb();
  if (opts?.excludeDocumentId) {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM evidence_sparse_docs d
         JOIN evidence e ON e.id = d.evidence_id
         JOIN facts f ON f.id = e.fact_id
         WHERE f.status = 'active' AND e.document_id != ?`,
      )
      .get(opts.excludeDocumentId) as { n: number };
    return row.n;
  }
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM evidence_sparse_docs d
       JOIN evidence e ON e.id = d.evidence_id
       JOIN facts f ON f.id = e.fact_id
       WHERE f.status = 'active'`,
    )
    .get() as { n: number };
  return row.n;
}

export function averageEvidenceSparseDocLength(opts?: {
  excludeDocumentId?: string;
}): number {
  ensureDb();
  if (opts?.excludeDocumentId) {
    const row = getDb()
      .prepare(
        `SELECT AVG(d.token_count) AS avgdl FROM evidence_sparse_docs d
         JOIN evidence e ON e.id = d.evidence_id
         JOIN facts f ON f.id = e.fact_id
         WHERE f.status = 'active' AND e.document_id != ?`,
      )
      .get(opts.excludeDocumentId) as { avgdl: number | null };
    return row.avgdl && row.avgdl > 0 ? row.avgdl : 1;
  }
  const row = getDb()
    .prepare(
      `SELECT AVG(d.token_count) AS avgdl FROM evidence_sparse_docs d
       JOIN evidence e ON e.id = d.evidence_id
       JOIN facts f ON f.id = e.fact_id
       WHERE f.status = 'active'`,
    )
    .get() as { avgdl: number | null };
  return row.avgdl && row.avgdl > 0 ? row.avgdl : 1;
}

export function evidenceDocumentFrequency(
  token: string,
  opts?: { excludeDocumentId?: string },
): number {
  ensureDb();
  if (opts?.excludeDocumentId) {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM evidence_sparse_postings p
         JOIN evidence e ON e.id = p.evidence_id
         JOIN facts f ON f.id = e.fact_id
         WHERE p.token = ? AND f.status = 'active' AND e.document_id != ?`,
      )
      .get(token, opts.excludeDocumentId) as { n: number };
    return row.n;
  }
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM evidence_sparse_postings p
       JOIN evidence e ON e.id = p.evidence_id
       JOIN facts f ON f.id = e.fact_id
       WHERE p.token = ? AND f.status = 'active'`,
    )
    .get(token) as { n: number };
  return row.n;
}

export function listEvidencePostingsForToken(
  token: string,
  opts?: { excludeDocumentId?: string },
): Array<{ evidence_id: string; tf: number; token_count: number }> {
  ensureDb();
  if (opts?.excludeDocumentId) {
    return getDb()
      .prepare(
        `SELECT p.evidence_id, p.tf, d.token_count
         FROM evidence_sparse_postings p
         JOIN evidence_sparse_docs d ON d.evidence_id = p.evidence_id
         JOIN evidence e ON e.id = p.evidence_id
         JOIN facts f ON f.id = e.fact_id
         WHERE p.token = ? AND f.status = 'active' AND e.document_id != ?`,
      )
      .all(token, opts.excludeDocumentId) as Array<{
      evidence_id: string;
      tf: number;
      token_count: number;
    }>;
  }
  return getDb()
    .prepare(
      `SELECT p.evidence_id, p.tf, d.token_count
       FROM evidence_sparse_postings p
       JOIN evidence_sparse_docs d ON d.evidence_id = p.evidence_id
       JOIN evidence e ON e.id = p.evidence_id
       JOIN facts f ON f.id = e.fact_id
       WHERE p.token = ? AND f.status = 'active'`,
    )
    .all(token) as Array<{
    evidence_id: string;
    tf: number;
    token_count: number;
  }>;
}
