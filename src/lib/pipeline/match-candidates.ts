import type { FactRow } from "@/lib/db/facts";
import { getFactsByIds, listFacts } from "@/lib/db/facts";
import { getMaxMatchPairs } from "@/lib/config";
import { hybridRetrieveForFact } from "@/lib/embeddings/hybrid";

export type FactPair = {
  left: FactRow;
  right: FactRow;
  reason: string;
  score: number;
};

/**
 * Hybrid candidate generation for Compare:
 * per new fact → match_key ∪ BM25 ∪ dense → RRF → pairs.
 * Hard-capped to MAX_MATCH_PAIRS.
 */
export function findCandidatePairs(
  documentId: string,
  limit = getMaxMatchPairs(),
): FactPair[] {
  const newFacts = listFacts(documentId).filter((f) => f.confidence >= 0.4);
  const pairs: FactPair[] = [];
  const seen = new Set<string>();

  const push = (
    left: FactRow,
    right: FactRow,
    reason: string,
    score: number,
  ) => {
    if (right.confidence < 0.4) return;
    if (right.document_id === left.document_id) return;
    const key = [left.id, right.id].sort().join(":");
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ left, right, reason, score });
  };

  for (const fact of newFacts) {
    const hits = hybridRetrieveForFact(fact, {
      excludeDocumentId: documentId,
    });
    if (hits.length === 0) continue;

    const others = getFactsByIds(hits.map((h) => h.factId));
    const byId = new Map(others.map((f) => [f.id, f]));

    for (const hit of hits) {
      const other = byId.get(hit.factId);
      if (!other) continue;
      const channels = hit.channels.join("+") || "hybrid";
      const boosts =
        hit.boosts.length > 0 ? `;boost=${hit.boosts.join("+")}` : "";
      push(
        fact,
        other,
        `hybrid:${channels};rrf=${hit.score.toFixed(4)}${boosts}`,
        hit.score,
      );
    }
  }

  return pairs.sort((a, b) => b.score - a.score).slice(0, limit);
}
