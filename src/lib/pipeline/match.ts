import { randomUUID } from "crypto";
import { getRerankTopN } from "@/lib/config";
import {
  insertRelation,
  clearRelations,
  listFacts,
  updateFactMatchKey,
  relationPairExists,
} from "@/lib/db/facts";
import { listDocuments } from "@/lib/db/documents";
import {
  classifyRelationBatch,
  classifyRelationHeuristic,
  getConfiguredMatchBatchSize,
} from "@/lib/pipeline/classify-relation";
import { findCandidatePairs } from "@/lib/pipeline/match-candidates";
import { rerankFactPairs } from "@/lib/pipeline/rerank";
import { buildMatchKey } from "@/lib/pipeline/extract-stage";
import { mapPool } from "@/lib/pipeline/pool";
import { setMatchHandler } from "@/lib/pipeline/worker";
import { insertFailure } from "@/lib/db/facts";
import { suggestionForError } from "@/lib/pipeline/error-hints";
import { decideReviewStatus } from "@/lib/pipeline/review-status";

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

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export async function matchDocumentFacts(documentId: string): Promise<number> {
  const recalled = findCandidatePairs(documentId, getRerankTopN());

  // Heuristics first on the full recall set so CE cannot drop clear Agrees /
  // Conflicts / Different-context pairs (e.g. crore↔million amount bridges).
  let written = 0;
  const needsLlm = [];
  const writtenKeys = new Set<string>();

  for (const pair of recalled) {
    const heuristic = classifyRelationHeuristic(pair.left, pair.right, {
      rerankScore: pair.score,
    });
    if (heuristic) {
      if (heuristic.relationType === "unrelated") continue;
      const key = pairKey(pair.left.id, pair.right.id);
      if (writtenKeys.has(key) || relationPairExists(pair.left.id, pair.right.id)) {
        writtenKeys.add(key);
        continue;
      }
      writtenKeys.add(key);
      insertRelation({
        id: randomUUID(),
        fact_a_id: pair.left.id,
        fact_b_id: pair.right.id,
        relation_type: heuristic.relationType,
        rationale: heuristic.rationale,
        context_tags: JSON.stringify(heuristic.contextTags || []),
        confidence: heuristic.confidence,
        review_status: decideReviewStatus({
          relationType: heuristic.relationType,
          confidence: heuristic.confidence,
        }),
      });
      written += 1;
      continue;
    }
    needsLlm.push(pair);
  }

  // CE + LLM only for ambiguous survivors
  let ambiguous = needsLlm;
  try {
    const reranked = await rerankFactPairs(needsLlm);
    ambiguous = reranked.pairs;
  } catch (err) {
    const message = err instanceof Error ? err.message : "rerank failed";
    insertFailure({
      id: randomUUID(),
      document_id: documentId,
      stage: "rerank",
      summary: "Cascade/CE rerank failed; continuing with hybrid pairs",
      detail: message,
      suggestion: suggestionForError("rerank", message),
    });
    ambiguous = needsLlm.slice(0, Math.min(needsLlm.length, 12));
  }

  const llmBatches = ambiguous.filter(
    (p) => !writtenKeys.has(pairKey(p.left.id, p.right.id)),
  );

  const batchSize = getConfiguredMatchBatchSize();
  const batches: (typeof llmBatches)[] = [];
  for (let i = 0; i < llmBatches.length; i += batchSize) {
    batches.push(llmBatches.slice(i, i + batchSize));
  }

  const batchWrites = await mapPool(batches, 1, async (batch) => {
    let local = 0;
    try {
      const results = await classifyRelationBatch(batch);
      let missing = 0;
      results.forEach((result, idx) => {
        if (!result) {
          missing += 1;
          return;
        }
        if (result.relationType === "unrelated") return;
        const pair = batch[idx];
        const key = pairKey(pair.left.id, pair.right.id);
        if (writtenKeys.has(key) || relationPairExists(pair.left.id, pair.right.id)) {
          writtenKeys.add(key);
          return;
        }
        writtenKeys.add(key);
        insertRelation({
          id: randomUUID(),
          fact_a_id: pair.left.id,
          fact_b_id: pair.right.id,
          relation_type: result.relationType,
          rationale: result.rationale,
          context_tags: JSON.stringify(result.contextTags || []),
          confidence: result.confidence,
          review_status: decideReviewStatus({
            relationType: result.relationType,
            confidence: result.confidence,
          }),
        });
        local += 1;
      });
      if (missing > 0) {
        insertFailure({
          id: randomUUID(),
          document_id: documentId,
          stage: "match",
          summary: `Classify batch missing ${missing}/${batch.length} indexes`,
          detail:
            "LLM returned partial/invalid JSON for some pair indexes; those pairs were skipped.",
          suggestion:
            "Rematch after rate limits cool, or lower MATCH_BATCH_SIZE for stabler classify batches.",
        });
      }
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
