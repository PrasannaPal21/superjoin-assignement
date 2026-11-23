import { getDb } from "./client";
import { ensureDb } from "./index";

export type FactRow = {
  id: string;
  document_id: string;
  chunk_id: string | null;
  claim: string;
  raw_value: string | null;
  numeric_value: number | null;
  unit: string | null;
  period: string | null;
  scope: string | null;
  entity: string | null;
  fact_type: string;
  confidence: number;
  status: string;
  match_key: string | null;
  created_at: string;
};

export type EvidenceRow = {
  id: string;
  fact_id: string;
  document_id: string;
  page: number | null;
  quote: string;
  created_at: string;
};

export type ReviewStatus =
  | "auto_accepted"
  | "needs_review"
  | "confirmed"
  | "rejected";

export type RelationRow = {
  id: string;
  fact_a_id: string;
  fact_b_id: string;
  relation_type: string;
  rationale: string | null;
  context_tags: string | null;
  confidence: number;
  review_status: ReviewStatus | string;
  created_at: string;
};

export type FailureRow = {
  id: string;
  document_id: string | null;
  stage: string;
  summary: string;
  detail: string | null;
  suggestion: string | null;
  created_at: string;
};

export function insertFact(
  fact: Omit<FactRow, "created_at"> & { created_at?: string },
): void {
  ensureDb();
  getDb()
    .prepare(
      `INSERT INTO facts (
        id, document_id, chunk_id, claim, raw_value, numeric_value, unit,
        period, scope, entity, fact_type, confidence, status, match_key
      ) VALUES (
        @id, @document_id, @chunk_id, @claim, @raw_value, @numeric_value, @unit,
        @period, @scope, @entity, @fact_type, @confidence, @status, @match_key
      )`,
    )
    .run({
      id: fact.id,
      document_id: fact.document_id,
      chunk_id: fact.chunk_id,
      claim: fact.claim,
      raw_value: fact.raw_value,
      numeric_value: fact.numeric_value,
      unit: fact.unit,
      period: fact.period,
      scope: fact.scope,
      entity: fact.entity,
      fact_type: fact.fact_type,
      confidence: fact.confidence,
      status: fact.status,
      match_key: fact.match_key,
    });
}

export function insertEvidence(row: Omit<EvidenceRow, "created_at">): void {
  ensureDb();
  getDb()
    .prepare(
      `INSERT INTO evidence (id, fact_id, document_id, page, quote)
       VALUES (@id, @fact_id, @document_id, @page, @quote)`,
    )
    .run(row);
}

export function insertRelation(
  row: Omit<RelationRow, "created_at" | "review_status"> & {
    review_status?: ReviewStatus | string;
  },
): void {
  ensureDb();
  getDb()
    .prepare(
      `INSERT INTO relations (
        id, fact_a_id, fact_b_id, relation_type, rationale, context_tags,
        confidence, review_status
      ) VALUES (
        @id, @fact_a_id, @fact_b_id, @relation_type, @rationale, @context_tags,
        @confidence, @review_status
      )`,
    )
    .run({
      ...row,
      review_status: row.review_status ?? "auto_accepted",
    });
}

export function insertFailure(row: Omit<FailureRow, "created_at">): void {
  ensureDb();
  getDb()
    .prepare(
      `INSERT INTO failures (id, document_id, stage, summary, detail, suggestion)
       VALUES (@id, @document_id, @stage, @summary, @detail, @suggestion)`,
    )
    .run(row);
}

export function listFacts(documentId?: string): FactRow[] {
  ensureDb();
  if (documentId) {
    return getDb()
      .prepare("SELECT * FROM facts WHERE document_id = ? ORDER BY created_at DESC")
      .all(documentId) as FactRow[];
  }
  return getDb()
    .prepare("SELECT * FROM facts ORDER BY created_at DESC")
    .all() as FactRow[];
}

export function getFact(id: string): FactRow | null {
  ensureDb();
  return (
    (getDb()
      .prepare(`SELECT * FROM facts WHERE id = ?`)
      .get(id) as FactRow | undefined) ?? null
  );
}

export function getFactsByIds(ids: string[]): FactRow[] {
  if (ids.length === 0) return [];
  ensureDb();
  const out: FactRow[] = [];
  const stmt = getDb().prepare(`SELECT * FROM facts WHERE id = ?`);
  for (const id of ids) {
    const row = stmt.get(id) as FactRow | undefined;
    if (row) out.push(row);
  }
  return out;
}

export function listEvidenceForFact(factId: string): EvidenceRow[] {
  ensureDb();
  return getDb()
    .prepare("SELECT * FROM evidence WHERE fact_id = ?")
    .all(factId) as EvidenceRow[];
}

export function listEvidenceForDocument(documentId: string): EvidenceRow[] {
  ensureDb();
  return getDb()
    .prepare(
      `SELECT * FROM evidence WHERE document_id = ? ORDER BY created_at DESC`,
    )
    .all(documentId) as EvidenceRow[];
}

export function getEvidence(id: string): EvidenceRow | null {
  ensureDb();
  return (
    (getDb()
      .prepare(`SELECT * FROM evidence WHERE id = ?`)
      .get(id) as EvidenceRow | undefined) ?? null
  );
}

export function getEvidenceByIds(ids: string[]): EvidenceRow[] {
  if (ids.length === 0) return [];
  ensureDb();
  const stmt = getDb().prepare(`SELECT * FROM evidence WHERE id = ?`);
  const out: EvidenceRow[] = [];
  for (const id of ids) {
    const row = stmt.get(id) as EvidenceRow | undefined;
    if (row) out.push(row);
  }
  return out;
}

export function listRelations(type?: string): RelationRow[] {
  ensureDb();
  if (type) {
    return getDb()
      .prepare("SELECT * FROM relations WHERE relation_type = ? ORDER BY created_at DESC")
      .all(type) as RelationRow[];
  }
  return getDb()
    .prepare("SELECT * FROM relations ORDER BY created_at DESC")
    .all() as RelationRow[];
}

export function listRelationsByReviewStatus(
  reviewStatus: ReviewStatus | string,
): RelationRow[] {
  ensureDb();
  return getDb()
    .prepare(
      `SELECT * FROM relations WHERE review_status = ? ORDER BY created_at DESC`,
    )
    .all(reviewStatus) as RelationRow[];
}

export function countRelationsByReviewStatus(
  reviewStatus: ReviewStatus | string,
): number {
  ensureDb();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM relations WHERE review_status = ?`,
    )
    .get(reviewStatus) as { n: number };
  return row.n;
}

export function countRelationsByType(relationType: string): number {
  ensureDb();
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM relations WHERE relation_type = ?`)
    .get(relationType) as { n: number };
  return row.n;
}

export function getRelation(id: string): RelationRow | null {
  ensureDb();
  return (
    (getDb()
      .prepare(`SELECT * FROM relations WHERE id = ?`)
      .get(id) as RelationRow | undefined) ?? null
  );
}

export function updateRelationReviewStatus(
  id: string,
  reviewStatus: ReviewStatus,
): boolean {
  ensureDb();
  const result = getDb()
    .prepare(`UPDATE relations SET review_status = ? WHERE id = ?`)
    .run(reviewStatus, id);
  return Number(result.changes ?? 0) > 0;
}

export function listFailures(): FailureRow[] {
  ensureDb();
  return getDb()
    .prepare("SELECT * FROM failures ORDER BY created_at DESC")
    .all() as FailureRow[];
}

export function listFactTypes(): string[] {
  ensureDb();
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT fact_type FROM facts WHERE fact_type IS NOT NULL ORDER BY fact_type`,
    )
    .all() as { fact_type: string }[];
  return rows.map((r) => r.fact_type);
}

export function getFactsByMatchKey(matchKey: string, excludeDocumentId?: string): FactRow[] {
  ensureDb();
  if (excludeDocumentId) {
    return getDb()
      .prepare(
        `SELECT * FROM facts WHERE match_key = ? AND document_id != ? AND status = 'active'`,
      )
      .all(matchKey, excludeDocumentId) as FactRow[];
  }
  return getDb()
    .prepare(`SELECT * FROM facts WHERE match_key = ? AND status = 'active'`)
    .all(matchKey) as FactRow[];
}

export function listFactsOutsideDocument(documentId: string): FactRow[] {
  ensureDb();
  return getDb()
    .prepare(
      `SELECT * FROM facts WHERE document_id != ? AND status = 'active' ORDER BY created_at DESC`,
    )
    .all(documentId) as FactRow[];
}

export function clearRelations(): void {
  ensureDb();
  getDb().prepare("DELETE FROM relations").run();
}

/** Wipe extracted knowledge for a document so it can be reprocessed. */
export function clearDocumentKnowledge(documentId: string): void {
  ensureDb();
  const db = getDb();
  db.prepare(
    `DELETE FROM relations WHERE fact_a_id IN (SELECT id FROM facts WHERE document_id = ?)
      OR fact_b_id IN (SELECT id FROM facts WHERE document_id = ?)`,
  ).run(documentId, documentId);
  db.prepare(
    `DELETE FROM evidence WHERE fact_id IN (SELECT id FROM facts WHERE document_id = ?)`,
  ).run(documentId);
  db.prepare(`DELETE FROM facts WHERE document_id = ?`).run(documentId);
  db.prepare(`DELETE FROM chunks WHERE document_id = ?`).run(documentId);
  db.prepare(`DELETE FROM failures WHERE document_id = ?`).run(documentId);
}

export function updateFactMatchKey(id: string, matchKey: string): void {
  ensureDb();
  getDb().prepare(`UPDATE facts SET match_key = ? WHERE id = ?`).run(matchKey, id);
}
