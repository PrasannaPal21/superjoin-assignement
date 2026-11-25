import { randomUUID } from "crypto";
import { getDocument, insertJob, updateDocumentStatus } from "@/lib/db/documents";
import {
  clearDocumentKnowledge,
  deleteFailuresByIds,
  getFailure,
  insertFailure,
  type FailureRow,
} from "@/lib/db/facts";
import { isEmbeddingsConfigured } from "@/lib/embeddings/client";
import { indexDocumentEmbeddings } from "@/lib/embeddings/index-document";
import { indexDocumentSparse } from "@/lib/embeddings/sparse";
import { suggestionForError } from "@/lib/pipeline/error-hints";
import { matchDocumentFacts, rematchAllDocuments } from "@/lib/pipeline/match";
import { retryFailedExtractPages } from "@/lib/pipeline/retry-failed-extract";
import { kickWorker } from "@/lib/pipeline/worker";

export type RetryFailureResult = {
  failureId: string;
  stage: string;
  action: string;
  message: string;
  ok: boolean;
};

function clearThisFailure(failure: FailureRow): void {
  deleteFailuresByIds([failure.id]);
}

/**
 * Retry only the failed stage — never a blanket wipe+re-extract of a healthy doc.
 */
export async function retryFailure(failureId: string): Promise<RetryFailureResult> {
  const failure = getFailure(failureId);
  if (!failure) {
    return {
      failureId,
      stage: "unknown",
      action: "none",
      message: "Failure entry not found (already cleared?)",
      ok: false,
    };
  }

  const stage = failure.stage;
  const documentId = failure.document_id;

  if (stage === "extract") {
    const result = await retryFailedExtractPages({ failureIds: [failureId] });
    return {
      failureId,
      stage,
      action: "retry_failed_pages",
      message:
        result.attempted === 0
          ? "No resolvable extract page/chunk for this failure"
          : `Retried ${result.succeededChunks}/${result.attempted} failed page(s); stored ${result.factsStored} fact(s).`,
      ok: result.succeededChunks > 0 || result.attempted === 0,
    };
  }

  if (stage === "match" || stage === "rerank") {
    if (documentId) {
      const n = await matchDocumentFacts(documentId);
      clearThisFailure(failure);
      return {
        failureId,
        stage,
        action: "rematch_document",
        message: `Rematched document comparisons (wrote ${n} relation(s)). Facts kept.`,
        ok: true,
      };
    }
    const all = await rematchAllDocuments();
    clearThisFailure(failure);
    return {
      failureId,
      stage,
      action: "rematch_all",
      message: `Rematched all documents (wrote ${all.relationsWritten} relation(s)). Facts kept.`,
      ok: true,
    };
  }

  if (stage === "embed" || stage === "sparse") {
    if (!documentId) {
      return {
        failureId,
        stage,
        action: "none",
        message: "No document linked to this index failure",
        ok: false,
      };
    }
    const doc = getDocument(documentId);
    if (!doc) {
      return {
        failureId,
        stage,
        action: "none",
        message: "Document missing",
        ok: false,
      };
    }
    try {
      if (stage === "embed" || stage === "sparse") {
        if (isEmbeddingsConfigured()) {
          await indexDocumentEmbeddings(documentId, { force: true });
        }
        indexDocumentSparse(documentId);
      }
      clearThisFailure(failure);
      return {
        failureId,
        stage,
        action: "reindex",
        message: `Re-indexed ${stage} for ${doc.original_filename} (facts kept).`,
        ok: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "reindex failed";
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage,
        summary: `Retry ${stage} failed`,
        detail: message,
        suggestion: suggestionForError(stage, message),
      });
      return {
        failureId,
        stage,
        action: "reindex",
        message,
        ok: false,
      };
    }
  }

  if (stage === "ask") {
    clearThisFailure(failure);
    return {
      failureId,
      stage,
      action: "dismiss",
      message: "Cleared Ask journal entry. Ask again from the Ask tab if needed.",
      ok: true,
    };
  }

  if (stage === "parse") {
    if (!documentId) {
      return {
        failureId,
        stage,
        action: "none",
        message: "No document linked to this parse failure",
        ok: false,
      };
    }
    const doc = getDocument(documentId);
    if (!doc) {
      return {
        failureId,
        stage,
        action: "none",
        message: "Document missing",
        ok: false,
      };
    }
    // Only re-queue parse when the document itself failed (nothing useful to keep).
    if (doc.status !== "failed" && doc.status !== "queued") {
      clearThisFailure(failure);
      return {
        failureId,
        stage,
        action: "dismiss",
        message:
          "Parse warning cleared. Document is already Ready — full wipe skipped to keep existing facts.",
        ok: true,
      };
    }
    clearDocumentKnowledge(documentId);
    updateDocumentStatus(documentId, "queued", { error_message: null });
    insertJob({ id: randomUUID(), document_id: documentId });
    clearThisFailure(failure);
    kickWorker();
    return {
      failureId,
      stage,
      action: "requeue_failed_doc",
      message: `Re-queued failed document ${doc.original_filename} for parse (it had no usable Ready state).`,
      ok: true,
    };
  }

  clearThisFailure(failure);
  return {
    failureId,
    stage,
    action: "dismiss",
    message: `No targeted retry for stage "${stage}"; journal entry cleared.`,
    ok: true,
  };
}

export async function retryFailures(failureIds: string[]): Promise<{
  results: RetryFailureResult[];
  okCount: number;
}> {
  const results: RetryFailureResult[] = [];
  for (const id of failureIds) {
    results.push(await retryFailure(id));
  }
  return {
    results,
    okCount: results.filter((r) => r.ok).length,
  };
}
