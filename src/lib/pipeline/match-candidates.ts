import type { FactRow } from "@/lib/db/facts";
import { getFactsByMatchKey, listFacts, listFactsOutsideDocument } from "@/lib/db/facts";

export type FactPair = {
  left: FactRow;
  right: FactRow;
  reason: string;
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
 * Cheap candidate generation before spending LLM calls.
 * Prefer same match_key; fall back to claim similarity + shared entity/type.
 */
export function findCandidatePairs(documentId: string, limit = 40): FactPair[] {
  const newFacts = listFacts(documentId);
  const pairs: FactPair[] = [];
  const seen = new Set<string>();

  for (const fact of newFacts) {
    if (fact.match_key) {
      const sameKey = getFactsByMatchKey(fact.match_key, documentId);
      for (const other of sameKey) {
        const key = [fact.id, other.id].sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ left: fact, right: other, reason: "match_key" });
      }
    }
  }

  if (pairs.length < limit) {
    const others = listFactsOutsideDocument(documentId);
    for (const fact of newFacts) {
      const leftTokens = tokenize(fact.claim);
      for (const other of others) {
        if (pairs.length >= limit) break;
        const key = [fact.id, other.id].sort().join(":");
        if (seen.has(key)) continue;

        const typeBoost =
          fact.fact_type && fact.fact_type === other.fact_type ? 0.15 : 0;
        const entityBoost =
          fact.entity &&
          other.entity &&
          fact.entity.toLowerCase() === other.entity.toLowerCase()
            ? 0.2
            : 0;
        const score = jaccard(leftTokens, tokenize(other.claim)) + typeBoost + entityBoost;
        if (score >= 0.35) {
          seen.add(key);
          pairs.push({ left: fact, right: other, reason: `similarity:${score.toFixed(2)}` });
        }
      }
    }
  }

  return pairs.slice(0, limit);
}
