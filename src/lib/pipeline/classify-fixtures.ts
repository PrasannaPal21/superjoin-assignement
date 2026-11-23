/**
 * Golden fixtures for relation classify (stage C6).
 * Labels: corroborates (Agrees) / contradicts (Conflicts) /
 * reconciled (Different context) / unrelated.
 *
 * Heuristic-resolvable pairs only — ambiguous/null cases stay out so the
 * offline eval does not call Groq.
 */

import type { FactRow } from "@/lib/db/facts";
import type { ReviewStatus } from "@/lib/pipeline/review-status";

export type ClassifyLabel =
  | "corroborates"
  | "contradicts"
  | "reconciled"
  | "unrelated";

export type FixtureFactPartial = {
  id: string;
  claim?: string;
  raw_value?: string | null;
  numeric_value?: number | null;
  unit?: string | null;
  period?: string | null;
  scope?: string | null;
  entity?: string | null;
  fact_type?: string;
  match_key?: string | null;
  confidence?: number;
};

export type ClassifyGoldenPair = {
  id: string;
  /** UI-facing bucket */
  ui: "Agrees" | "Conflicts" | "Different context" | "Unrelated";
  expected: ClassifyLabel;
  /** Optional contextTags that must be present when expected is reconciled/unrelated */
  expectTags?: string[];
  /** Optional floor on heuristic confidence */
  minConfidence?: number;
  left: FixtureFactPartial;
  right: FixtureFactPartial;
  /** Rerank score passed into heuristic (entity/type mismatch gates) */
  rerankScore?: number;
  note: string;
};

export type HitlGoldenCase = {
  id: string;
  relationType: ClassifyLabel;
  confidence: number;
  expectedReview: ReviewStatus;
  note: string;
};

export function fixtureToFactRow(partial: FixtureFactPartial): FactRow {
  return {
    id: partial.id,
    document_id: "doc-fixture",
    chunk_id: null,
    claim: partial.claim ?? "claim",
    raw_value: partial.raw_value ?? null,
    numeric_value: partial.numeric_value ?? null,
    unit: partial.unit ?? null,
    period: partial.period ?? null,
    scope: partial.scope ?? null,
    entity: partial.entity ?? "Delhivery",
    fact_type: partial.fact_type ?? "revenue",
    confidence: partial.confidence ?? 0.9,
    status: "active",
    match_key: partial.match_key ?? "delhivery|revenue|crore",
    created_at: "",
  };
}

/** Offline goldens — must resolve via heuristics with no LLM. */
export const CLASSIFY_GOLDEN_PAIRS: readonly ClassifyGoldenPair[] = [
  {
    id: "agrees-equal-revenue",
    ui: "Agrees",
    expected: "corroborates",
    minConfidence: 0.9,
    note: "Same FY24 revenue figure, matching unit/scope",
    left: {
      id: "a-rev-eq",
      claim: "Revenue from operations",
      numeric_value: 8143,
      raw_value: "8143",
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
      fact_type: "revenue",
      match_key: "delhivery|revenue|crore",
    },
    right: {
      id: "b-rev-eq",
      claim: "Top-line revenue reported for the year",
      numeric_value: 8143,
      raw_value: "8143",
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
      fact_type: "revenue",
      match_key: "delhivery|revenue|crore",
    },
  },
  {
    id: "agrees-raw-value",
    ui: "Agrees",
    expected: "corroborates",
    minConfidence: 0.7,
    note: "Numeric null but identical raw_value + same type",
    left: {
      id: "a-raw",
      claim: "Revenue",
      raw_value: "8143",
      numeric_value: null,
      unit: "crore",
      period: "FY24",
    },
    right: {
      id: "b-raw",
      claim: "Revenue",
      raw_value: "8143",
      numeric_value: null,
      unit: "crore",
      period: "FY24",
    },
  },
  {
    id: "conflicts-same-context",
    ui: "Conflicts",
    expected: "contradicts",
    minConfidence: 0.78,
    note: "Same period/unit/scope, conflicting numbers",
    left: {
      id: "a-conf",
      claim: "Revenue from operations",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    },
    right: {
      id: "b-conf",
      claim: "Revenue from operations",
      numeric_value: 7200,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    },
  },
  {
    id: "reconciled-time",
    ui: "Different context",
    expected: "reconciled",
    expectTags: ["time"],
    note: "Different FY explains value gap",
    left: {
      id: "a-fy24",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
    },
    right: {
      id: "b-fy23",
      numeric_value: 7221,
      unit: "crore",
      period: "FY23",
    },
  },
  {
    id: "reconciled-scope",
    ui: "Different context",
    expected: "reconciled",
    expectTags: ["scope"],
    note: "Consolidated vs standalone same headline number",
    left: {
      id: "a-consol",
      numeric_value: 500,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    },
    right: {
      id: "b-stand",
      numeric_value: 500,
      unit: "crore",
      period: "FY24",
      scope: "standalone",
    },
  },
  {
    id: "reconciled-units",
    ui: "Different context",
    expected: "reconciled",
    expectTags: ["units"],
    note: "Same number labeled crore vs million",
    left: {
      id: "a-crore",
      numeric_value: 100,
      unit: "crore",
      period: "FY24",
    },
    right: {
      id: "b-mn",
      numeric_value: 100,
      unit: "million",
      period: "FY24",
    },
  },
  {
    id: "unrelated-entity",
    ui: "Unrelated",
    expected: "unrelated",
    expectTags: ["entity"],
    note: "Different entity families",
    left: {
      id: "a-del",
      entity: "Delhivery",
      numeric_value: 100,
      unit: "crore",
      period: "FY24",
    },
    right: {
      id: "b-acme",
      entity: "Acme Logistics",
      numeric_value: 100,
      unit: "crore",
      period: "FY24",
      match_key: "acme|revenue|crore",
    },
  },
  {
    id: "unrelated-fact-type",
    ui: "Unrelated",
    expected: "unrelated",
    expectTags: ["fact_type"],
    note: "Revenue vs fleet under weak rerank",
    rerankScore: 0.2,
    left: {
      id: "a-rev",
      fact_type: "revenue",
      match_key: "delhivery|revenue|crore",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
    },
    right: {
      id: "b-fleet",
      claim: "Owned fleet vehicles",
      fact_type: "fleet",
      match_key: "delhivery|fleet|vehicles",
      numeric_value: 12000,
      unit: "vehicles",
      period: "FY24",
    },
  },
] as const;

/**
 * HITL gate expectations (threshold default 0.75 in tests via env).
 * Only low-confidence contradicts → needs_review.
 */
export const HITL_GOLDEN_CASES: readonly HitlGoldenCase[] = [
  {
    id: "hitl-weak-conflict",
    relationType: "contradicts",
    confidence: 0.5,
    expectedReview: "needs_review",
    note: "Weak conflict must queue for human confirm/reject",
  },
  {
    id: "hitl-strong-conflict",
    relationType: "contradicts",
    confidence: 0.9,
    expectedReview: "auto_accepted",
    note: "High-confidence conflict auto-accepts",
  },
  {
    id: "hitl-agrees-low-conf",
    relationType: "corroborates",
    confidence: 0.4,
    expectedReview: "auto_accepted",
    note: "Agrees never forced into HITL in v1",
  },
  {
    id: "hitl-reconciled-low-conf",
    relationType: "reconciled",
    confidence: 0.4,
    expectedReview: "auto_accepted",
    note: "Reconciled never forced into HITL in v1",
  },
  {
    id: "hitl-unrelated",
    relationType: "unrelated",
    confidence: 0.3,
    expectedReview: "auto_accepted",
    note: "Unrelated is not persisted as a Compare row; gate still auto",
  },
] as const;

export type ClassifyEvalRow = {
  id: string;
  expected: ClassifyLabel;
  predicted: ClassifyLabel | null;
  ok: boolean;
};

/** Macro accuracy over golden heuristic pairs. */
export function scoreClassifyGoldens(
  rows: ClassifyEvalRow[],
): {
  accuracy: number;
  total: number;
  correct: number;
  byLabel: Record<
    ClassifyLabel,
    { support: number; correct: number; predicted: number }
  >;
} {
  const labels: ClassifyLabel[] = [
    "corroborates",
    "contradicts",
    "reconciled",
    "unrelated",
  ];
  const byLabel = Object.fromEntries(
    labels.map((l) => [l, { support: 0, correct: 0, predicted: 0 }]),
  ) as Record<
    ClassifyLabel,
    { support: number; correct: number; predicted: number }
  >;

  let correct = 0;
  for (const row of rows) {
    byLabel[row.expected].support += 1;
    if (row.predicted) byLabel[row.predicted].predicted += 1;
    if (row.ok) {
      correct += 1;
      byLabel[row.expected].correct += 1;
    }
  }
  const total = rows.length;
  return {
    accuracy: total === 0 ? 0 : correct / total,
    total,
    correct,
    byLabel,
  };
}
