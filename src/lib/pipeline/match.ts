import { randomUUID } from "crypto";
import { insertRelation } from "@/lib/db/facts";
import {
  classifyRelationBatch,
  classifyRelationHeuristic,
  getConfiguredMatchBatchSize,
} from "@/lib/pipeline/classify-relation";
import { findCandidatePairs } from "@/lib/pipeline/match-candidates";
import { mapPool } from "@/lib/pipeline/pool";
import { setMatchHandler } from "@/lib/pipeline/worker";

export async function matchDocumentFacts(documentId: string): Promise<number> {
  const pairs = findCandidatePairs(documentId);
  let written = 0;

  const needsLlm = [];
  for (const pair of pairs) {
    const heuristic = classifyRelationHeuristic(pair.left, pair.right);
    if (heuristic) {
      if (heuristic.relationType === "unrelated") continue;
      insertRelation({
        id: randomUUID(),
        fact_a_id: pair.left.id,
        fact_b_id: pair.right.id,
        relation_type: heuristic.relationType,
        rationale: heuristic.rationale,
        context_tags: JSON.stringify(heuristic.contextTags || []),
        confidence: heuristic.confidence,
      });
      written += 1;
      continue;
    }
    needsLlm.push(pair);
  }

  const batchSize = getConfiguredMatchBatchSize();
  const batches: (typeof needsLlm)[] = [];
  for (let i = 0; i < needsLlm.length; i += batchSize) {
    batches.push(needsLlm.slice(i, i + batchSize));
  }

  const batchWrites = await mapPool(batches, 2, async (batch) => {
    let local = 0;
    try {
      const results = await classifyRelationBatch(batch);
      results.forEach((result, idx) => {
        if (!result || result.relationType === "unrelated") return;
        const pair = batch[idx];
        insertRelation({
          id: randomUUID(),
          fact_a_id: pair.left.id,
          fact_b_id: pair.right.id,
          relation_type: result.relationType,
          rationale: result.rationale,
          context_tags: JSON.stringify(result.contextTags || []),
          confidence: result.confidence,
        });
        local += 1;
      });
    } catch {
      // Skip a bad batch rather than failing the whole document
    }
    return local;
  });

  return written + batchWrites.reduce((a, b) => a + b, 0);
}

setMatchHandler(async (documentId) => {
  await matchDocumentFacts(documentId);
});
