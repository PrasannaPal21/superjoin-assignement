import type { FactRow } from "@/lib/db/facts";
import { getFactsByMatchKey, listFacts, listFactsOutsideDocument } from "@/lib/db/facts";
import { getMaxMatchPairs } from "@/lib/config";

export type FactPair = {
  left: FactRow;
  right: FactRow;
  reason: string;
  score: number;
};

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9%\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Cheap candidate generation. Prefer match_key hits, then high similarity.
 * Hard-capped to MAX_MATCH_PAIRS to bound LLM spend.
 */
export function findCandidatePairs(
  documentId: string,
  limit = getMaxMatchPairs(),
): FactPair[] {
  const newFacts = listFacts(documentId).filter((f) => f.confidence >= 0.45);
  const pairs: FactPair[] = [];
  const seen = new Set<string>();

  const push = (left: FactRow, right: FactRow, reason: string, score: number) => {
    const key = [left.id, right.id].sort().join(":");
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ left, right, reason, score });
  };

  for (const fact of newFacts) {
    if (!fact.match_key) continue;
    const sameKey = getFactsByMatchKey(fact.match_key, documentId);
    for (const other of sameKey) {
      push(fact, other, "match_key", 1);
    }
  }

  const others = listFactsOutsideDocument(documentId).filter((f) => f.confidence >= 0.45);
  for (const fact of newFacts) {
    const leftTokens = tokenize(fact.claim);
    for (const other of others) {
      const typeBoost =
        fact.fact_type && fact.fact_type === other.fact_type ? 0.2 : 0;
      const entityBoost =
        fact.entity &&
        other.entity &&
        fact.entity.toLowerCase() === other.entity.toLowerCase()
          ? 0.2
          : 0;
      const score = jaccard(leftTokens, tokenize(other.claim)) + typeBoost + entityBoost;
      if (score >= 0.45) {
        push(fact, other, `similarity:${score.toFixed(2)}`, score);
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score).slice(0, limit);
}
