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
import { suggestionForError } from "@/lib/pipeline/error-hints";
import { getGroqApiKey } from "@/lib/llm/groq";

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
    if (!getGroqApiKey()) {
      throw new Error(
        "GROQ_API_KEY is missing. Set it in .env (or deployment env) and restart the Node process.",
      );
    }

    updateDocumentStatus(documentId, "processing");
    updateJobProgress(jobId, "parsing", 0, 1);

    updateJobProgress(jobId, "parsing (+OCR if needed)", 0, 1);
    const parsed = await extractPdfPages(doc.stored_path);
    updateDocumentStatus(documentId, "processing", { page_count: parsed.pageCount });

    // OCR success is normal — do not journal. Only fail when text is still unusable.
    if (parsed.emptyPageCount > parsed.pages.length * 0.8) {
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "parse",
        summary: "Most pages still had little text after local OCR",
        detail: `${parsed.emptyPageCount}/${parsed.pages.length} pages below the text threshold after pdf.js${
          parsed.ocrPageCount ? ` + Tesseract (${parsed.ocrPageCount} OCR pages)` : ""
        }.`,
        suggestion: suggestionForError(
          "parse",
          "Most pages still had little text after local OCR",
        ),
      });
    }

    const chunks = chunkPages(parsed.pages);
    if (chunks.length === 0) {
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "parse",
        summary: "No text chunks produced",
        detail: parsed.ocrPageCount
          ? `pdf.js + local OCR (${parsed.ocrPageCount} pages) still produced no chunkable text.`
          : "Parser returned no usable page text (OCR disabled or all pages empty).",
        suggestion: suggestionForError("parse", "No text chunks produced"),
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
            suggestion: suggestionForError("extract", message),
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
        suggestion: suggestionForError("match", message),
      });
    }

    updateDocumentStatus(documentId, "ready");
    updateJobProgress(jobId, `done (${factCount} facts)`, 1, 1);
    completeJob(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "processing failed";
    updateDocumentStatus(documentId, "failed", { error_message: message });
    failJob(jobId, message);
  }
}
