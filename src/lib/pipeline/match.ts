import { randomUUID } from "crypto";
import { insertRelation, clearRelations, listFacts, updateFactMatchKey } from "@/lib/db/facts";
import { listDocuments } from "@/lib/db/documents";
import {
  classifyRelationBatch,
  classifyRelationHeuristic,
  getConfiguredMatchBatchSize,
} from "@/lib/pipeline/classify-relation";
import { findCandidatePairs } from "@/lib/pipeline/match-candidates";
import { buildMatchKey } from "@/lib/pipeline/extract-stage";
import { mapPool } from "@/lib/pipeline/pool";
import { setMatchHandler } from "@/lib/pipeline/worker";
import { insertFailure } from "@/lib/db/facts";

function refreshMatchKeys(): number {
  let n = 0;
  for (const fact of listFacts()) {
    const next = buildMatchKey({
      entity: fact.entity,
      factType: fact.fact_type,
      unit: fact.unit,
      claim: fact.claim,
    });
    if (next !== fact.match_key) {
      updateFactMatchKey(fact.id, next);
      n += 1;
    }
  }
  return n;
}

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

  const batchWrites = await mapPool(batches, 1, async (batch) => {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "match batch failed";
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "match",
        summary: `Relation batch of ${batch.length} pairs failed`,
        detail: message,
        suggestion:
          "Wait for Groq rate limits to cool, then POST /api/rematch to rebuild comparisons.",
      });
    }
    return local;
  });

  return written + batchWrites.reduce((a, b) => a + b, 0);
}

/** Recompute match keys and rebuild all cross-document relations from current facts. */
export async function rematchAllDocuments(): Promise<{
  keysUpdated: number;
  relationsWritten: number;
  documentsMatched: number;
}> {
  const keysUpdated = refreshMatchKeys();
  clearRelations();

  // Oldest first so later docs see earlier facts (same order as incremental ingest).
  const docs = listDocuments()
    .filter((d) => d.status === "ready")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let relationsWritten = 0;
  for (const doc of docs) {
    relationsWritten += await matchDocumentFacts(doc.id);
  }

  return { keysUpdated, relationsWritten, documentsMatched: docs.length };
}

setMatchHandler(async (documentId) => {
  await matchDocumentFacts(documentId);
});
