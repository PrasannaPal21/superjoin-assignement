import { randomUUID } from "crypto";
import {
  getChunk,
  listChildChunksByPageSpan,
  type ChunkRow,
} from "@/lib/db/chunks";
import { getDocument } from "@/lib/db/documents";
import {
  deleteFailuresByIds,
  insertFailure,
  listFailures,
  type FailureRow,
} from "@/lib/db/facts";
import { isEmbeddingsConfigured } from "@/lib/embeddings/client";
import { indexDocumentEmbeddings } from "@/lib/embeddings/index-document";
import { indexDocumentSparse } from "@/lib/embeddings/sparse";
import { extractAndStoreChunkFacts } from "@/lib/pipeline/extract-stage";
import { suggestionForError } from "@/lib/pipeline/error-hints";
import { matchDocumentFacts } from "@/lib/pipeline/match";

const PAGE_FAIL_RE =
  /Child p\.(\d+)-(\d+) extraction failed/i;

export type RetryFailedExtractOpts = {
  /** Limit to these failure rows (Issues per-entry / bulk). */
  failureIds?: string[];
  /** Or all extract failures for these documents. */
  documentIds?: string[];
};

export type RetryFailedExtractResult = {
  attempted: number;
  succeededChunks: number;
  factsStored: number;
  clearedFailures: number;
  documentIds: string[];
  pages: Array<{ documentId: string; pageStart: number; pageEnd: number }>;
};

function parsePageSpan(
  summary: string,
): { pageStart: number; pageEnd: number } | null {
  const m = summary.match(PAGE_FAIL_RE);
  if (!m) return null;
  return { pageStart: Number(m[1]), pageEnd: Number(m[2]) };
}

function selectExtractFailures(opts: RetryFailedExtractOpts): FailureRow[] {
  let rows = listFailures().filter((f) => f.stage === "extract");
  if (opts.failureIds?.length) {
    const want = new Set(opts.failureIds);
    rows = rows.filter((f) => want.has(f.id));
  }
  if (opts.documentIds?.length) {
    const want = new Set(opts.documentIds);
    rows = rows.filter((f) => f.document_id && want.has(f.document_id));
  }
  return rows;
}

function resolveChunk(failure: FailureRow): ChunkRow | null {
  if (failure.chunk_id) {
    const byId = getChunk(failure.chunk_id);
    if (byId) return byId;
  }
  if (!failure.document_id) return null;
  const span = parsePageSpan(failure.summary);
  if (!span) return null;
  return (
    listChildChunksByPageSpan(
      failure.document_id,
      span.pageStart,
      span.pageEnd,
    )[0] ?? null
  );
}

/**
 * Re-run Groq extract only for child chunks that previously failed.
 * Does not wipe the rest of the document's facts.
 */
export async function retryFailedExtractPages(
  opts: RetryFailedExtractOpts = {},
): Promise<RetryFailedExtractResult> {
  const failures = selectExtractFailures(opts);
  const byChunk = new Map<
    string,
    { chunk: ChunkRow; failureIds: string[] }
  >();

  for (const failure of failures) {
    const chunk = resolveChunk(failure);
    if (!chunk) continue;
    const cur = byChunk.get(chunk.id);
    if (cur) cur.failureIds.push(failure.id);
    else byChunk.set(chunk.id, { chunk, failureIds: [failure.id] });
  }

  let succeededChunks = 0;
  let factsStored = 0;
  let clearedFailures = 0;
  const touchedDocs = new Set<string>();
  const pages: RetryFailedExtractResult["pages"] = [];

  for (const { chunk, failureIds } of byChunk.values()) {
    const parent = chunk.parent_id ? getChunk(chunk.parent_id) : null;
    try {
      const n = await extractAndStoreChunkFacts({
        documentId: chunk.document_id,
        chunkId: chunk.id,
        chunk: {
          pageStart: chunk.page_start,
          pageEnd: chunk.page_end,
          text: chunk.text,
          tokenEstimate: chunk.token_estimate ?? Math.ceil(chunk.text.length / 4),
          signalScore: 0,
          kind: (chunk.kind as "child" | "parent" | "flat") || "child",
          parentId: chunk.parent_id,
          sectionTitle: chunk.section_title,
          blockKind: chunk.block_kind as "table" | "narrative" | null,
        },
        parentContext: parent?.text ?? null,
      });
      factsStored += n;
      succeededChunks += 1;
      touchedDocs.add(chunk.document_id);
      pages.push({
        documentId: chunk.document_id,
        pageStart: chunk.page_start,
        pageEnd: chunk.page_end,
      });
      clearedFailures += deleteFailuresByIds(failureIds);
    } catch (err) {
      const message = err instanceof Error ? err.message : "extract failed";
      // Keep old failures; add a fresh journal line for this retry.
      insertFailure({
        id: randomUUID(),
        document_id: chunk.document_id,
        chunk_id: chunk.id,
        stage: "extract",
        summary: `Child p.${chunk.page_start}-${chunk.page_end} extraction failed`,
        detail: message,
        suggestion: suggestionForError("extract", message),
      });
    }
  }

  for (const documentId of touchedDocs) {
    const doc = getDocument(documentId);
    if (!doc) continue;
    if (isEmbeddingsConfigured()) {
      try {
        await indexDocumentEmbeddings(documentId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "embed failed";
        insertFailure({
          id: randomUUID(),
          document_id: documentId,
          stage: "embed",
          summary: "Dense re-index after failed-page retry failed",
          detail: message,
          suggestion: suggestionForError("embed", message),
        });
      }
    }
    try {
      indexDocumentSparse(documentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "sparse failed";
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "sparse",
        summary: "Sparse re-index after failed-page retry failed",
        detail: message,
        suggestion: suggestionForError("sparse", message),
      });
    }
    try {
      await matchDocumentFacts(documentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "match failed";
      insertFailure({
        id: randomUUID(),
        document_id: documentId,
        stage: "match",
        summary: "Rematch after failed-page retry failed",
        detail: message,
        suggestion: suggestionForError("match", message),
      });
    }
  }

  return {
    attempted: byChunk.size,
    succeededChunks,
    factsStored,
    clearedFailures,
    documentIds: [...touchedDocs],
    pages,
  };
}
