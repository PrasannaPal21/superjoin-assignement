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

export type RelationRow = {
  id: string;
  fact_a_id: string;
  fact_b_id: string;
  relation_type: string;
  rationale: string | null;
  context_tags: string | null;
  confidence: number;
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

export function insertRelation(row: Omit<RelationRow, "created_at">): void {
  ensureDb();
  getDb()
    .prepare(
      `INSERT INTO relations (
        id, fact_a_id, fact_b_id, relation_type, rationale, context_tags, confidence
      ) VALUES (
        @id, @fact_a_id, @fact_b_id, @relation_type, @rationale, @context_tags, @confidence
      )`,
    )
    .run(row);
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

export function listEvidenceForFact(factId: string): EvidenceRow[] {
  ensureDb();
  return getDb()
    .prepare("SELECT * FROM evidence WHERE fact_id = ?")
    .all(factId) as EvidenceRow[];
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
