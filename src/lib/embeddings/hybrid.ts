import {
  getDenseTopK,
  getRrfK,
  getRrfTopN,
  getSparseTopK,
} from "@/lib/config";
import { getFactEmbedding } from "@/lib/db/embeddings";
import {
  getFactsByMatchKey,
  type FactRow,
} from "@/lib/db/facts";
import { denseSearch } from "@/lib/embeddings/dense";
import { buildFactCard } from "@/lib/embeddings/index-text";
import { reciprocalRankFusion } from "@/lib/embeddings/rrf";
import { sparseSearch } from "@/lib/embeddings/sparse";

export const HYBRID_CHANNELS = ["match_key", "sparse", "dense"] as const;
export type HybridChannel = (typeof HYBRID_CHANNELS)[number];

export type HybridHit = {
  factId: string;
  score: number;
  channels: HybridChannel[];
};

export type HybridRetrieveOptions = {
  excludeDocumentId: string;
  sparseTopK?: number;
  denseTopK?: number;
  rrfTopN?: number;
  rrfK?: number;
};

/**
 * Hybrid candidate recall for one new fact:
 * match_key ∪ BM25 ∪ dense → RRF fusion.
 */
export function hybridRetrieveForFact(
  fact: FactRow,
  opts: HybridRetrieveOptions,
): HybridHit[] {
  const sparseTopK = opts.sparseTopK ?? getSparseTopK();
  const denseTopK = opts.denseTopK ?? getDenseTopK();
  const rrfTopN = opts.rrfTopN ?? getRrfTopN();
  const rrfK = opts.rrfK ?? getRrfK();
  const exclude = opts.excludeDocumentId;

  const matchKeyIds: string[] = [];
  if (fact.match_key) {
    for (const other of getFactsByMatchKey(fact.match_key, exclude)) {
      if (other.confidence >= 0.4) matchKeyIds.push(other.id);
    }
  }

  const card =
    buildFactCard(fact).replace(/\s+/g, " ").trim() ||
    [fact.claim, fact.entity, fact.fact_type].filter(Boolean).join(" ");
  const sparseIds = card
    ? sparseSearch(card, sparseTopK, { excludeDocumentId: exclude }).map(
        (h) => h.factId,
      )
    : [];

  const denseIds: string[] = [];
  const emb = getFactEmbedding(fact.id);
  if (emb?.embedding?.length) {
    for (const hit of denseSearch(emb.embedding, denseTopK, {
      excludeDocumentId: exclude,
      model: emb.model,
    })) {
      denseIds.push(hit.factId);
    }
  }

  const fused = reciprocalRankFusion(
    [matchKeyIds, sparseIds, denseIds],
    { k: rrfK, topN: rrfTopN },
  );

  return fused.map((hit) => ({
    factId: hit.id,
    score: hit.score,
    channels: hit.lists.map((i) => HYBRID_CHANNELS[i]),
  }));
}
