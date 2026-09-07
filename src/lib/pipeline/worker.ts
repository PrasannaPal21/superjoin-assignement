import { randomUUID } from "crypto";
import { getMaxConcurrentJobs } from "@/lib/config";
import { getDocument, updateDocumentStatus } from "@/lib/db/documents";
import {
  claimNextJob,
  completeJob,
  countJobsByStatus,
  failJob,
  updateJobProgress,
} from "@/lib/db/jobs";
import { insertFailure } from "@/lib/db/facts";
import { chunkPages } from "@/lib/pdf/chunk";
import { extractPdfPages } from "@/lib/pdf/parse";
import {
  extractAndStoreChunkFacts,
  persistChunk,
} from "@/lib/pipeline/extract-stage";

// Matching is wired in a later commit; keep a soft hook so the worker stays stable.
let matchNewDocumentFacts: (documentId: string) => Promise<void> = async () => {
  /* no-op until matcher lands */
};

export function setMatchHandler(
  fn: (documentId: string) => Promise<void>,
): void {
  matchNewDocumentFacts = fn;
}

let ticking = false;

export function kickWorker(): void {
  if (ticking) return;
  ticking = true;
  // Fire-and-forget; Next route handlers shouldn't block on full pipelines
  setTimeout(() => {
    void runWorkerLoop().finally(() => {
      ticking = false;
    });
  }, 0);
}

async function runWorkerLoop(): Promise<void> {
  const maxConcurrent = getMaxConcurrentJobs();
  while (countJobsByStatus("running") < maxConcurrent) {
    const job = claimNextJob();
    if (!job) break;
    await processJob(job.id, job.document_id);
  }
}

async function processJob(jobId: string, documentId: string): Promise<void> {
  const doc = getDocument(documentId);
  if (!doc) {
    failJob(jobId, "Document missing");
    return;
  }

  try {
    updateDocumentStatus(documentId, "processing");
    updateJobProgress(jobId, "parsing", 0, 1);

    const parsed = await extractPdfPages(doc.stored_path);
    updateDocumentStatus(documentId, "processing", { page_count: parsed.pageCount });

    const emptyPages = parsed.pages.filter((p) => !p.text || p.text.length < 20).length;
    if (emptyPages > parsed.pages.length * 0.8) {
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "parse",
        summary: "Most pages had little or no extractable text",
        detail: `${emptyPages}/${parsed.pageCount} pages looked empty. Likely scanned/image PDF without OCR.`,
        suggestion: "Add an OCR pass (e.g. Tesseract) or ask for text-based PDFs.",
      });
    }

    const chunks = chunkPages(parsed.pages);
    if (chunks.length === 0) {
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "parse",
        summary: "No text chunks produced",
        detail: "Parser returned no usable page text.",
        suggestion: "Verify the PDF is not encrypted or image-only.",
      });
      updateDocumentStatus(documentId, "failed", {
        error_message: "No extractable text",
      });
      failJob(jobId, "No extractable text");
      return;
    }

    let factCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      updateJobProgress(jobId, "extracting", i + 1, chunks.length);
      const chunk = chunks[i];
      const chunkId = persistChunk(documentId, chunk);
      try {
        factCount += await extractAndStoreChunkFacts({
          documentId,
          chunkId,
          chunk,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "extract failed";
        insertFailure({
          id: randomUUID(),
          document_id: documentId,
          stage: "extract",
          summary: `Chunk ${chunk.pageStart}-${chunk.pageEnd} extraction failed`,
          detail: message,
          suggestion: "Retry with a lower temperature or smaller chunk size.",
        });
      }
    }

    updateJobProgress(jobId, "matching", 0, 1);
    try {
      await matchNewDocumentFacts(documentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "match failed";
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "match",
        summary: "Cross-document matching failed after extraction",
        detail: message,
        suggestion: "Facts were kept; re-run matching once the model is available.",
      });
    }

    updateDocumentStatus(documentId, "ready");
    completeJob(jobId);
    updateJobProgress(jobId, `done (${factCount} facts)`, 1, 1);
  } catch (err) {
    const message = err instanceof Error ? err.message : "processing failed";
    updateDocumentStatus(documentId, "failed", { error_message: message });
    failJob(jobId, message);
  }
}
