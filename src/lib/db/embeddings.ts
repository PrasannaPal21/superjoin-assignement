import { ensureDb } from "@/lib/db";
import { getDb } from "@/lib/db/client";
import { decodeVector, encodeVector } from "@/lib/embeddings/vector-codec";

export type FactEmbeddingRow = {
  fact_id: string;
  model: string;
  dimensions: number;
  embedding: number[];
  index_text: string | null;
  created_at: string;
  updated_at: string;
};

export type EvidenceEmbeddingRow = {
  evidence_id: string;
  model: string;
  dimensions: number;
  embedding: number[];
  index_text: string | null;
  created_at: string;
  updated_at: string;
};

type FactEmbeddingDbRow = {
  fact_id: string;
  model: string;
  dimensions: number;
  embedding: Buffer;
  index_text: string | null;
  created_at: string;
  updated_at: string;
};

type EvidenceEmbeddingDbRow = {
  evidence_id: string;
  model: string;
  dimensions: number;
  embedding: Buffer;
  index_text: string | null;
  created_at: string;
  updated_at: string;
};

function mapFact(row: FactEmbeddingDbRow): FactEmbeddingRow {
  return {
    ...row,
    embedding: decodeVector(row.embedding),
  };
}

function mapEvidence(row: EvidenceEmbeddingDbRow): EvidenceEmbeddingRow {
  return {
    ...row,
    embedding: decodeVector(row.embedding),
  };
}

export function upsertFactEmbedding(opts: {
  factId: string;
  model: string;
  embedding: number[];
  indexText?: string | null;
}): void {
  ensureDb();
  const dimensions = opts.embedding.length;
  getDb()
    .prepare(
      `INSERT INTO fact_embeddings (
         fact_id, model, dimensions, embedding, index_text, updated_at
       ) VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(fact_id) DO UPDATE SET
         model = excluded.model,
         dimensions = excluded.dimensions,
         embedding = excluded.embedding,
         index_text = excluded.index_text,
         updated_at = datetime('now')`,
    )
    .run(
      opts.factId,
      opts.model,
      dimensions,
      encodeVector(opts.embedding),
      opts.indexText ?? null,
    );
}

export function getFactEmbedding(factId: string): FactEmbeddingRow | null {
  ensureDb();
  const row = getDb()
    .prepare(`SELECT * FROM fact_embeddings WHERE fact_id = ?`)
    .get(factId) as FactEmbeddingDbRow | undefined;
  return row ? mapFact(row) : null;
}

export function listFactEmbeddings(model?: string): FactEmbeddingRow[] {
  ensureDb();
  const db = getDb();
  const rows = (
    model
      ? db
          .prepare(`SELECT * FROM fact_embeddings WHERE model = ?`)
          .all(model)
      : db.prepare(`SELECT * FROM fact_embeddings`).all()
  ) as FactEmbeddingDbRow[];
  return rows.map(mapFact);
}

export function countFactEmbeddings(model?: string): number {
  ensureDb();
  const row = (
    model
      ? getDb()
          .prepare(
            `SELECT COUNT(*) AS n FROM fact_embeddings WHERE model = ?`,
          )
          .get(model)
      : getDb().prepare(`SELECT COUNT(*) AS n FROM fact_embeddings`).get()
  ) as { n: number };
  return row.n;
}

export function deleteFactEmbedding(factId: string): void {
  ensureDb();
  getDb().prepare(`DELETE FROM fact_embeddings WHERE fact_id = ?`).run(factId);
}

export function upsertEvidenceEmbedding(opts: {
  evidenceId: string;
  model: string;
  embedding: number[];
  indexText?: string | null;
}): void {
  ensureDb();
  const dimensions = opts.embedding.length;
  getDb()
    .prepare(
      `INSERT INTO evidence_embeddings (
         evidence_id, model, dimensions, embedding, index_text, updated_at
       ) VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(evidence_id) DO UPDATE SET
         model = excluded.model,
         dimensions = excluded.dimensions,
         embedding = excluded.embedding,
         index_text = excluded.index_text,
         updated_at = datetime('now')`,
    )
    .run(
      opts.evidenceId,
      opts.model,
      dimensions,
      encodeVector(opts.embedding),
      opts.indexText ?? null,
    );
}

export function getEvidenceEmbedding(
  evidenceId: string,
): EvidenceEmbeddingRow | null {
  ensureDb();
  const row = getDb()
    .prepare(`SELECT * FROM evidence_embeddings WHERE evidence_id = ?`)
    .get(evidenceId) as EvidenceEmbeddingDbRow | undefined;
  return row ? mapEvidence(row) : null;
}

export function listEvidenceEmbeddings(model?: string): EvidenceEmbeddingRow[] {
  ensureDb();
  const db = getDb();
  const rows = (
    model
      ? db
          .prepare(`SELECT * FROM evidence_embeddings WHERE model = ?`)
          .all(model)
      : db.prepare(`SELECT * FROM evidence_embeddings`).all()
  ) as EvidenceEmbeddingDbRow[];
  return rows.map(mapEvidence);
}

export function countEvidenceEmbeddings(model?: string): number {
  ensureDb();
  const row = (
    model
      ? getDb()
          .prepare(
            `SELECT COUNT(*) AS n FROM evidence_embeddings WHERE model = ?`,
          )
          .get(model)
      : getDb().prepare(`SELECT COUNT(*) AS n FROM evidence_embeddings`).get()
  ) as { n: number };
  return row.n;
}

export function deleteEvidenceEmbedding(evidenceId: string): void {
  ensureDb();
  getDb()
    .prepare(`DELETE FROM evidence_embeddings WHERE evidence_id = ?`)
    .run(evidenceId);
}
