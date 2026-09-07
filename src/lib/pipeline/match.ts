import { randomUUID } from "crypto";
import { insertRelation } from "@/lib/db/facts";
import { classifyRelation } from "@/lib/pipeline/classify-relation";
import { findCandidatePairs } from "@/lib/pipeline/match-candidates";
import { setMatchHandler } from "@/lib/pipeline/worker";

export async function matchDocumentFacts(documentId: string): Promise<number> {
  const pairs = findCandidatePairs(documentId);
  let written = 0;

  for (const pair of pairs) {
    try {
      const result = await classifyRelation(pair.left, pair.right);
      if (result.relationType === "unrelated") continue;

      insertRelation({
        id: randomUUID(),
        fact_a_id: pair.left.id,
        fact_b_id: pair.right.id,
        relation_type: result.relationType,
        rationale: result.rationale,
        context_tags: JSON.stringify(result.contextTags || []),
        confidence: result.confidence,
      });
      written += 1;
    } catch {
      // Skip a bad pair; worker-level failure journal covers systemic issues
    }
  }

  return written;
}

// Wire into the worker as soon as this module is imported
setMatchHandler(async (documentId) => {
  await matchDocumentFacts(documentId);
});
