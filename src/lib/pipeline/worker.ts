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
import { extractPdfPages } from "@/lib/pdf/parse";
import { buildChunkHierarchy } from "@/lib/pdf/hierarchy";
import {
  selectExtractChildren,
  type ExtractJob,
} from "@/lib/pdf/select-extract";
import { summarizeSections } from "@/lib/pdf/structure";
import { summarizeBlocks } from "@/lib/pdf/tables";
import {
  extractAndStoreChunkFacts,
  persistChunk,
} from "@/lib/pipeline/extract-stage";
import { mapPool } from "@/lib/pipeline/pool";
import { suggestionForError } from "@/lib/pipeline/error-hints";
import { getGroqApiKey } from "@/lib/llm/groq";
import { indexDocumentEmbeddings } from "@/lib/embeddings/index-document";
import { isEmbeddingsConfigured } from "@/lib/embeddings/client";
import { indexDocumentSparse } from "@/lib/embeddings/sparse";

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

    updateJobProgress(jobId, "building parent/child hierarchy", 0, 1);
    const hierarchy = buildChunkHierarchy(parsed.pages);
    updateJobProgress(
      jobId,
      `${summarizeSections(hierarchy.sections)}; ${summarizeBlocks(hierarchy.blocks)}`,
      0,
      1,
    );

    updateJobProgress(jobId, "persisting parent + child chunks", 0, 1);
    const extractJobs: ExtractJob[] = [];
    for (const node of hierarchy.nodes) {
      const parentId = persistChunk(documentId, node.parent);
      for (const child of node.children) {
        const linked = { ...child, parentId };
        const childId = persistChunk(documentId, linked);
        extractJobs.push({ child: linked, childId, parent: node.parent });
      }
    }
    updateJobProgress(
      jobId,
      `stored ${hierarchy.nodes.length} parents + ${extractJobs.length} children`,
      0,
      1,
    );

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

    // Extract on highest-signal children with parent context.
    const selected = selectExtractChildren(extractJobs);
    if (selected.length === 0) {
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "parse",
        summary: "No child chunks available for extraction",
        detail: parsed.ocrPageCount
          ? `pdf.js + local OCR (${parsed.ocrPageCount} pages) produced no extractable children.`
          : "Structure pipeline produced no child chunks.",
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
      selected,
      getMaxConcurrentExtractions(),
      async (job) => {
        try {
          const n = await extractAndStoreChunkFacts({
            documentId,
            chunkId: job.childId,
            chunk: job.child,
            parentContext: job.parent.text,
          });
          completed += 1;
          updateJobProgress(jobId, "extracting children", completed, selected.length);
          return n;
        } catch (err) {
          completed += 1;
          updateJobProgress(jobId, "extracting children", completed, selected.length);
          const message = err instanceof Error ? err.message : "extract failed";
          insertFailure({
            id: randomUUID(),
            document_id: documentId,
            stage: "extract",
            summary: `Child p.${job.child.pageStart}-${job.child.pageEnd} extraction failed`,
            detail: message,
            suggestion: suggestionForError("extract", message),
          });
          return 0;
        }
      },
    );
    const factCount = extractionResults.reduce((a, b) => a + b, 0);

    if (factCount > 0 && isEmbeddingsConfigured()) {
      updateJobProgress(jobId, "embedding facts + evidence", 0, 1);
      try {
        const emb = await indexDocumentEmbeddings(documentId, {
          onProgress: (label, current, total) =>
            updateJobProgress(jobId, label, current, total),
        });
        updateJobProgress(
          jobId,
          `embedded ${emb.factsIndexed} facts / ${emb.evidenceIndexed} evidence (skipped ${emb.factsSkipped + emb.evidenceSkipped})`,
          1,
          1,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "embed failed";
        insertFailure({
          id: randomUUID(),
          document_id: documentId,
          stage: "embed",
          summary: "Dense embedding indexing failed after extraction",
          detail: message,
          suggestion: suggestionForError("embed", message),
        });
      }
    }

    if (factCount > 0) {
      updateJobProgress(jobId, "indexing sparse / BM25", 0, 1);
      try {
        const sparse = indexDocumentSparse(documentId);
        updateJobProgress(
          jobId,
          `sparse-indexed ${sparse.factsIndexed} facts / ${sparse.evidenceIndexed} evidence`,
          1,
          1,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "sparse index failed";
        insertFailure({
          id: randomUUID(),
          document_id: documentId,
          stage: "sparse",
          summary: "Sparse/BM25 indexing failed after extraction",
          detail: message,
          suggestion: suggestionForError("sparse", message),
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
        suggestion: suggestionForError("match", message),
      });
    }

    updateDocumentStatus(documentId, "ready");
    updateJobProgress(
      jobId,
      `done (${factCount} facts from ${selected.length}/${extractJobs.length} children)`,
      1,
      1,
    );
    completeJob(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "processing failed";
    updateDocumentStatus(documentId, "failed", { error_message: message });
    failJob(jobId, message);
  }
}
