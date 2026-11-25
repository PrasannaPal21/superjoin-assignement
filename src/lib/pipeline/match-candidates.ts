import type { FactRow } from "@/lib/db/facts";
import { getFactsByIds, listFacts } from "@/lib/db/facts";
import { getMaxMatchPairs } from "@/lib/config";
import { hybridRetrieveForFact } from "@/lib/embeddings/hybrid";
import {
  amountsEquivalent,
  periodRelation,
  sameMetricFamily,
} from "@/lib/pipeline/fact-normalize";

function bridgeWorthy(
  fact: FactRow,
  other: FactRow,
  amtEqual: boolean,
): boolean {
  const pRel = periodRelation(fact.period, other.period);
  if (pRel === "incompatible") return false;
  if (amtEqual) return pRel === "same" || pRel === "unknown" || pRel === "parallel";
  // Non-equal: only bridge true nested / parallel for candidate recall
  return pRel === "nested" || pRel === "parallel" || pRel === "same";
}

export type FactPair = {
  left: FactRow;
  right: FactRow;
  reason: string;
  score: number;
};

/**
 * Hybrid candidate generation for Compare:
 * per new fact → match_key ∪ BM25 ∪ dense → RRF → pairs,
 * plus a numeric/metric-family bridge for unit-scale near-matches hybrid may miss.
 * Hard-capped to MAX_MATCH_PAIRS.
 */
export function findCandidatePairs(
  documentId: string,
  limit = getMaxMatchPairs(),
): FactPair[] {
  const newFacts = listFacts(documentId).filter((f) => f.confidence >= 0.4);
  const corpus = listFacts().filter(
    (f) => f.confidence >= 0.4 && f.document_id !== documentId,
  );
  const pairByKey = new Map<string, FactPair>();

  const push = (
    left: FactRow,
    right: FactRow,
    reason: string,
    score: number,
  ) => {
    if (right.confidence < 0.4) return;
    if (right.document_id === left.document_id) return;
    const key = [left.id, right.id].sort().join(":");
    const existing = pairByKey.get(key);
    if (existing) {
      if (score > existing.score) {
        existing.score = score;
        existing.reason = reason;
      }
      return;
    }
    const pair = { left, right, reason, score };
    pairByKey.set(key, pair);
  };

  for (const fact of newFacts) {
    const hits = hybridRetrieveForFact(fact, {
      excludeDocumentId: documentId,
    });

    if (hits.length > 0) {
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

    // Bridge: same metric family + equivalent amount or nested/same period.
    // Catches ₹ crore ↔ million pairs hybrid often ranks out.
    if (fact.numeric_value == null) continue;
    for (const other of corpus) {
      if (other.numeric_value == null) continue;
      if (
        !sameMetricFamily(
          fact.fact_type,
          other.fact_type,
          fact.match_key,
          other.match_key,
          fact.claim,
          other.claim,
        )
      ) {
        continue;
      }
      const amt = amountsEquivalent(
        fact.numeric_value,
        fact.unit,
        other.numeric_value,
        other.unit,
      );
      if (!bridgeWorthy(fact, other, amt.equal)) continue;
      const pRel = periodRelation(fact.period, other.period);
      // Rank amount bridges above typical weak hybrid noise so unit-scale
      // Agrees (crore↔million) survive MAX_MATCH_PAIRS truncation.
      const score = amt.equal ? 0.08 : 0.045;
      push(
        fact,
        other,
        `bridge:family+${amt.equal ? `amount:${amt.scale}` : `period:${pRel}`}`,
        score,
      );
    }
  }

  return [...pairByKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
