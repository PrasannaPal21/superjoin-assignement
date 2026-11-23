import { describe, expect, it } from "vitest";
import {
  CLASSIFY_GOLDEN_PAIRS,
  HITL_GOLDEN_CASES,
  fixtureToFactRow,
  scoreClassifyGoldens,
  type ClassifyEvalRow,
  type ClassifyLabel,
} from "@/lib/pipeline/classify-fixtures";
import { classifyRelationHeuristic } from "@/lib/pipeline/classify-relation";
import { decideReviewStatus } from "@/lib/pipeline/review-status";

describe("classify golden fixtures (stage C6)", () => {
  it("covers all four relation labels", () => {
    const labels = new Set(CLASSIFY_GOLDEN_PAIRS.map((p) => p.expected));
    expect(labels).toEqual(
      new Set<ClassifyLabel>([
        "corroborates",
        "contradicts",
        "reconciled",
        "unrelated",
      ]),
    );
  });

  it("heuristics match every golden label (offline, no LLM)", () => {
    const rows: ClassifyEvalRow[] = CLASSIFY_GOLDEN_PAIRS.map((pair) => {
      const left = fixtureToFactRow(pair.left);
      const right = fixtureToFactRow(pair.right);
      const result = classifyRelationHeuristic(left, right, {
        rerankScore: pair.rerankScore,
      });
      const predicted = (result?.relationType as ClassifyLabel | undefined) ?? null;
      const tagsOk =
        !pair.expectTags ||
        pair.expectTags.every((t) => result?.contextTags?.includes(t));
      const confOk =
        pair.minConfidence == null ||
        (result != null && result.confidence >= pair.minConfidence);
      return {
        id: pair.id,
        expected: pair.expected,
        predicted,
        ok: predicted === pair.expected && tagsOk && confOk,
      };
    });

    const score = scoreClassifyGoldens(rows);
    const misses = rows.filter((r) => !r.ok);
    expect(misses, JSON.stringify(misses, null, 2)).toEqual([]);
    expect(score.accuracy).toBe(1);
    expect(score.total).toBe(CLASSIFY_GOLDEN_PAIRS.length);

    for (const label of [
      "corroborates",
      "contradicts",
      "reconciled",
      "unrelated",
    ] as const) {
      expect(score.byLabel[label].support).toBeGreaterThan(0);
      expect(score.byLabel[label].correct).toBe(score.byLabel[label].support);
    }
  });

  it("each golden documents expected UI bucket", () => {
    const map: Record<ClassifyLabel, string> = {
      corroborates: "Agrees",
      contradicts: "Conflicts",
      reconciled: "Different context",
      unrelated: "Unrelated",
    };
    for (const pair of CLASSIFY_GOLDEN_PAIRS) {
      expect(pair.ui).toBe(map[pair.expected]);
    }
  });
});

describe("HITL golden fixtures (stage C6)", () => {
  it("routes review_status as specified", () => {
    for (const row of HITL_GOLDEN_CASES) {
      expect(
        decideReviewStatus({
          relationType: row.relationType,
          confidence: row.confidence,
          threshold: 0.75,
        }),
        row.id,
      ).toBe(row.expectedReview);
    }
  });
});
