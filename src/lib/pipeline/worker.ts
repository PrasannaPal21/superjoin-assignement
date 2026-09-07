import { randomUUID } from "crypto";
import { getMaxConcurrentExtractions, getMaxConcurrentJobs } from "@/lib/config";
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
import { mapPool } from "@/lib/pipeline/pool";

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
  void import("@/lib/pipeline/match");
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

    let completed = 0;
    const extractionResults = await mapPool(
      chunks,
      getMaxConcurrentExtractions(),
      async (chunk) => {
        const chunkId = persistChunk(documentId, chunk);
        try {
          const n = await extractAndStoreChunkFacts({
            documentId,
            chunkId,
            chunk,
          });
          completed += 1;
          updateJobProgress(jobId, "extracting", completed, chunks.length);
          return n;
        } catch (err) {
          completed += 1;
          updateJobProgress(jobId, "extracting", completed, chunks.length);
          const message = err instanceof Error ? err.message : "extract failed";
          insertFailure({
            id: randomUUID(),
            document_id: documentId,
            stage: "extract",
            summary: `Chunk ${chunk.pageStart}-${chunk.pageEnd} extraction failed`,
            detail: message,
            suggestion: "Retry with a lower temperature or smaller chunk size.",
          });
          return 0;
        }
      },
    );
    const factCount = extractionResults.reduce((a, b) => a + b, 0);

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
