/**
 * Golden fixtures for embeddings pipeline smoke / eval (step 10).
 * Paraphrase pair is intentionally weak on token Jaccard but strong on dense.
 */

import { buildFactCard, tokenizeIndexText } from "@/lib/embeddings/index-text";

export type FixtureFact = {
  id: string;
  documentId: string;
  entity: string;
  factType: string;
  claim: string;
  rawValue: string;
  unit: string;
  period: string;
  scope: string | null;
  matchKey: string;
};

/** Canonical fact-card examples (format lock). */
export const FACT_CARD_FIXTURES = [
  {
    input: {
      entity: "Delhivery Limited",
      factType: "revenue",
      claim: "Revenue from operations",
      rawValue: "8143",
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    },
    card: "Delhivery Limited | revenue | Revenue from operations | 8143 | crore | FY24 | consolidated",
  },
  {
    input: {
      entity: "Delhivery",
      factType: "income",
      claim: "Total income from operations",
      rawValue: "8143",
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    },
    card: "Delhivery | income | Total income from operations | 8143 | crore | FY24 | consolidated",
  },
] as const;

/**
 * Pair missed by exact match_key + weak Jaccard; recovered via dense+RRF.
 * Claims intentionally share few tokens (lexical miss) while vectors align.
 */
export const PARAPHRASE_PAIR = {
  left: {
    id: "fix-new-income",
    documentId: "doc-new",
    entity: "Delhivery Limited",
    factType: "income",
    claim: "Top-line sales figure reported",
    rawValue: "8143",
    unit: "crore",
    period: "FY24",
    scope: "consolidated",
    matchKey: "delhivery|income|crore",
  } satisfies FixtureFact,
  right: {
    id: "fix-old-revenue",
    documentId: "doc-old",
    entity: "Delhivery",
    factType: "revenue",
    claim: "Revenue from operations",
    rawValue: "8143",
    unit: "crore",
    period: "FY24",
    scope: "consolidated",
    matchKey: "delhivery|revenue|crore",
  } satisfies FixtureFact,
  unrelated: {
    id: "fix-old-fleet",
    documentId: "doc-old",
    entity: "Delhivery",
    factType: "fleet",
    claim: "Owned fleet vehicles",
    rawValue: "12000",
    unit: "vehicles",
    period: "FY24",
    scope: null,
    matchKey: "delhivery|fleet|vehicles",
  } satisfies FixtureFact,
  /** Max Jaccard we expect for the paraphrase pair (should stay below this). */
  jaccardCeiling: 0.4,
};

export function jaccardTokenOverlap(a: string, b: string): number {
  const ta = new Set(tokenizeIndexText(a));
  const tb = new Set(tokenizeIndexText(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

export function fixtureFactCard(f: FixtureFact): string {
  return buildFactCard({
    entity: f.entity,
    factType: f.factType,
    claim: f.claim,
    rawValue: f.rawValue,
    unit: f.unit,
    period: f.period,
    scope: f.scope,
  });
}
