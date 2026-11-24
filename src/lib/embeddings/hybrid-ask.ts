import {
  getAskDenseTopK,
  getAskRrfTopN,
  getAskSparseTopK,
  getRrfK,
} from "@/lib/config";
import { getEvidenceByIds } from "@/lib/db/facts";
import { denseSearchEvidence } from "@/lib/embeddings/dense";
import { embedText } from "@/lib/embeddings/client";
import { reciprocalRankFusion } from "@/lib/embeddings/rrf";
import { sparseSearchEvidence } from "@/lib/embeddings/sparse";

export const ASK_CHANNELS = ["sparse", "dense"] as const;
export type AskChannel = (typeof ASK_CHANNELS)[number];

export type AskEvidenceHit = {
  evidenceId: string;
  factId: string;
  documentId: string;
  page: number | null;
  quote: string;
  score: number;
  channels: AskChannel[];
};

export type HybridAskOptions = {
  sparseTopK?: number;
  denseTopK?: number;
  rrfTopN?: number;
  rrfK?: number;
  excludeDocumentId?: string;
  /** Precomputed query embedding (skips embedText). */
  queryVector?: number[];
};

/**
 * Ask path A0: embed question → BM25 ∪ dense over evidence → RRF.
 * Caps prefer ASK_* env (A1), else Compare SPARSE/DENSE/RRF defaults.
 * Returns citation-ready rows (factId, page, quote). Generation is A4+.
 */
export async function hybridRetrieveEvidence(
  query: string,
  opts: HybridAskOptions = {},
): Promise<AskEvidenceHit[]> {
  const sparseTopK = opts.sparseTopK ?? getAskSparseTopK();
  const denseTopK = opts.denseTopK ?? getAskDenseTopK();
  const rrfTopN = opts.rrfTopN ?? getAskRrfTopN();
  const rrfK = opts.rrfK ?? getRrfK();
  const scope = { excludeDocumentId: opts.excludeDocumentId };

  const q = (query ?? "").replace(/\s+/g, " ").trim();
  if (!q) return [];

  const sparseIds = sparseSearchEvidence(q, sparseTopK, scope).map(
    (h) => h.evidenceId,
  );

  const vector = opts.queryVector ?? (await embedText(q));
  const denseIds = denseSearchEvidence(vector, denseTopK, scope).map(
    (h) => h.evidenceId,
  );

  const fused = reciprocalRankFusion([sparseIds, denseIds], {
    k: rrfK,
    topN: rrfTopN,
  });
  if (fused.length === 0) return [];

  const rows = getEvidenceByIds(fused.map((h) => h.id));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const hits: AskEvidenceHit[] = [];
  for (const hit of fused) {
    const row = byId.get(hit.id);
    if (!row) continue;
    hits.push({
      evidenceId: row.id,
      factId: row.fact_id,
      documentId: row.document_id,
      page: row.page,
      quote: row.quote,
      score: hit.score,
      channels: hit.lists.map((i) => ASK_CHANNELS[i]),
    });
  }
  return hits;
}
