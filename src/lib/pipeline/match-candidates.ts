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
 * Cheap candidate generation. Prefer match_key hits, then same fact_type,
 * then lexical similarity. Hard-capped to MAX_MATCH_PAIRS.
 */
export function findCandidatePairs(
  documentId: string,
  limit = getMaxMatchPairs(),
): FactPair[] {
  const newFacts = listFacts(documentId).filter((f) => f.confidence >= 0.4);
  const others = listFactsOutsideDocument(documentId).filter((f) => f.confidence >= 0.4);
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

  for (const fact of newFacts) {
    const leftTokens = tokenize(
      [fact.claim, fact.raw_value, fact.entity, fact.fact_type].filter(Boolean).join(" "),
    );
    const leftType = (fact.fact_type || "").toLowerCase();

    for (const other of others) {
      const rightType = (other.fact_type || "").toLowerCase();
      if (leftType && rightType && leftType === rightType && leftType !== "other") {
        push(fact, other, "fact_type", 0.6);
      }

      const typeBoost = leftType && leftType === rightType ? 0.25 : 0;
      const entityBoost =
        fact.entity &&
        other.entity &&
        fact.entity.toLowerCase().includes(
          other.entity.toLowerCase().split(/\s+/)[0] || "",
        )
          ? 0.15
          : 0;
      const score =
        jaccard(
          leftTokens,
          tokenize(
            [other.claim, other.raw_value, other.entity, other.fact_type]
              .filter(Boolean)
              .join(" "),
          ),
        ) +
        typeBoost +
        entityBoost;
      if (score >= 0.28) {
        push(fact, other, `similarity:${score.toFixed(2)}`, score);
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score).slice(0, limit);
}
