/**
 * Offline smoke for relation classify goldens (C6).
 * No MiniLM / Groq — heuristics + HITL gate only.
 *
 * Usage: npx tsx scripts/smoke-classify.ts
 */
import {
  CLASSIFY_GOLDEN_PAIRS,
  HITL_GOLDEN_CASES,
  fixtureToFactRow,
  scoreClassifyGoldens,
  type ClassifyEvalRow,
  type ClassifyLabel,
} from "../src/lib/pipeline/classify-fixtures";
import { classifyRelationHeuristic } from "../src/lib/pipeline/classify-relation";
import { decideReviewStatus } from "../src/lib/pipeline/review-status";

function main() {
  const rows: ClassifyEvalRow[] = [];
  for (const pair of CLASSIFY_GOLDEN_PAIRS) {
    const result = classifyRelationHeuristic(
      fixtureToFactRow(pair.left),
      fixtureToFactRow(pair.right),
      { rerankScore: pair.rerankScore },
    );
    const predicted = (result?.relationType as ClassifyLabel | undefined) ?? null;
    const tagsOk =
      !pair.expectTags ||
      pair.expectTags.every((t) => result?.contextTags?.includes(t));
    const confOk =
      pair.minConfidence == null ||
      (result != null && result.confidence >= pair.minConfidence);
    const ok = predicted === pair.expected && tagsOk && confOk;
    rows.push({
      id: pair.id,
      expected: pair.expected,
      predicted,
      ok,
    });
    const mark = ok ? "ok" : "FAIL";
    console.log(
      `[${mark}] ${pair.id} → ${predicted ?? "null"} (want ${pair.expected})`,
    );
  }

  const score = scoreClassifyGoldens(rows);
  console.log(
    `\naccuracy ${score.correct}/${score.total} (${(score.accuracy * 100).toFixed(0)}%)`,
  );
  for (const [label, stats] of Object.entries(score.byLabel)) {
    console.log(
      `  ${label}: ${stats.correct}/${stats.support} correct (predicted ${stats.predicted})`,
    );
  }

  let hitlOk = 0;
  for (const row of HITL_GOLDEN_CASES) {
    const got = decideReviewStatus({
      relationType: row.relationType,
      confidence: row.confidence,
      threshold: 0.75,
    });
    const ok = got === row.expectedReview;
    if (ok) hitlOk += 1;
    console.log(
      `[${ok ? "ok" : "FAIL"}] HITL ${row.id} → ${got} (want ${row.expectedReview})`,
    );
  }
  console.log(`HITL ${hitlOk}/${HITL_GOLDEN_CASES.length}`);

  if (score.accuracy < 1 || hitlOk < HITL_GOLDEN_CASES.length) {
    process.exitCode = 1;
  }
}

main();
