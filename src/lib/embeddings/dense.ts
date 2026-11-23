import { getEmbeddingModel } from "@/lib/config";
import {
  listEvidenceEmbeddingsForSearch,
  listFactEmbeddingsForSearch,
} from "@/lib/db/embeddings";
import {
  cosineSimilarity,
  embedText,
  l2Normalize,
} from "@/lib/embeddings/client";

export type DenseHit = {
  factId: string;
  score: number;
};

export type DenseEvidenceHit = {
  evidenceId: string;
  score: number;
};

export type DenseSearchOptions = {
  /** Compare path: search only other documents. */
  excludeDocumentId?: string;
  /** Defaults to active EMBEDDING_MODEL. */
  model?: string;
  /** Drop hits below this cosine (default 0). */
  minScore?: number;
};

/**
 * Brute-force cosine (dot product on L2-normalized vectors) over fact_embeddings.
 * No sqlite-vec yet — fine for assignment-scale corpora; maps to ANN/pgvector later.
 */
export function denseSearch(
  queryVector: number[],
  topK = 20,
  opts: DenseSearchOptions = {},
): DenseHit[] {
  if (topK <= 0 || queryVector.length === 0) return [];

  const query = l2Normalize(queryVector);
  const model = opts.model ?? getEmbeddingModel();
  const minScore = opts.minScore ?? 0;
  const rows = listFactEmbeddingsForSearch({
    model,
    excludeDocumentId: opts.excludeDocumentId,
  });

  const hits: DenseHit[] = [];
  for (const row of rows) {
    if (row.embedding.length !== query.length) continue;
    const score = cosineSimilarity(query, row.embedding);
    if (score < minScore) continue;
    hits.push({ factId: row.fact_id, score });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.factId.localeCompare(b.factId))
    .slice(0, topK);
}

/** Embed a query string, then denseSearch (same model space as index). */
export async function denseSearchText(
  query: string,
  topK = 20,
  opts: DenseSearchOptions = {},
): Promise<DenseHit[]> {
  const vector = await embedText(query);
  return denseSearch(vector, topK, opts);
}

/** Cosine search over evidence_embeddings (Ask prep). */
export function denseSearchEvidence(
  queryVector: number[],
  topK = 20,
  opts: DenseSearchOptions = {},
): DenseEvidenceHit[] {
  if (topK <= 0 || queryVector.length === 0) return [];

  const query = l2Normalize(queryVector);
  const model = opts.model ?? getEmbeddingModel();
  const minScore = opts.minScore ?? 0;
  const rows = listEvidenceEmbeddingsForSearch({
    model,
    excludeDocumentId: opts.excludeDocumentId,
  });

  const hits: DenseEvidenceHit[] = [];
  for (const row of rows) {
    if (row.embedding.length !== query.length) continue;
    const score = cosineSimilarity(query, row.embedding);
    if (score < minScore) continue;
    hits.push({ evidenceId: row.evidence_id, score });
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score || a.evidenceId.localeCompare(b.evidenceId),
    )
    .slice(0, topK);
}
