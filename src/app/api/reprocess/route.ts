import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getDocument,
  listDocuments,
  updateDocumentStatus,
  insertJob,
} from "@/lib/db/documents";
import { clearDocumentKnowledge } from "@/lib/db/facts";
import { retryFailedExtractPages } from "@/lib/pipeline/retry-failed-extract";
import { kickWorker } from "@/lib/pipeline/worker";

export const runtime = "nodejs";

/**
 * Reprocess knowledge.
 *
 * Body:
 * - { mode: "failed_pages", failureIds?: string[], documentIds?: string[] }
 *   Re-run Groq extract only for failed child chunks/pages (keeps other facts).
 * - { documentIds?: string[] } or empty
 *   Full wipe + re-queue (legacy Compare "Re-extract all" / whole-doc).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    mode?: unknown;
    documentIds?: unknown;
    failureIds?: unknown;
  } | null;

  const mode = body?.mode === "failed_pages" ? "failed_pages" : "document";

  if (mode === "failed_pages") {
    const failureIds = Array.isArray(body?.failureIds)
      ? body.failureIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : [];
    const documentIds = Array.isArray(body?.documentIds)
      ? body.documentIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : [];

    if (failureIds.length === 0 && documentIds.length === 0) {
      return NextResponse.json(
        { error: "Provide failureIds and/or documentIds for failed_pages mode" },
        { status: 400 },
      );
    }

    try {
      const result = await retryFailedExtractPages({
        failureIds: failureIds.length ? failureIds : undefined,
        documentIds: documentIds.length ? documentIds : undefined,
      });

      if (result.attempted === 0) {
        return NextResponse.json(
          {
            error:
              "No extract failures with resolvable page chunks found for the selection",
          },
          { status: 400 },
        );
      }

      const pageLabel = result.pages
        .slice(0, 8)
        .map((p) => `p.${p.pageStart}-${p.pageEnd}`)
        .join(", ");

      return NextResponse.json({
        ok: true,
        mode: "failed_pages",
        message: `Retried ${result.succeededChunks}/${result.attempted} failed page chunk(s); stored ${result.factsStored} new fact(s).${
          pageLabel ? ` Pages: ${pageLabel}${result.pages.length > 8 ? "…" : ""}` : ""
        }`,
        ...result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retry failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const requestedIds = Array.isArray(body?.documentIds)
    ? body.documentIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];

  let docs =
    requestedIds.length > 0
      ? requestedIds
          .map((id) => getDocument(id))
          .filter((d): d is NonNullable<typeof d> => Boolean(d))
      : listDocuments().filter(
          (d) => d.status === "ready" || d.status === "failed",
        );

  // Explicit Issues full reprocess may target a stuck processing doc.
  docs = docs.filter((d) =>
    requestedIds.length > 0
      ? d.status === "ready" ||
        d.status === "failed" ||
        d.status === "processing" ||
        d.status === "queued"
      : true,
  );

  const seen = new Set<string>();
  const ordered = [...docs]
    .filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (ordered.length === 0) {
    return NextResponse.json(
      { error: "No matching documents to reprocess" },
      { status: 400 },
    );
  }

  const queued: { documentId: string; jobId: string; filename: string }[] = [];

  for (const doc of ordered) {
    clearDocumentKnowledge(doc.id);
    updateDocumentStatus(doc.id, "queued", { error_message: null });
    const jobId = randomUUID();
    insertJob({ id: jobId, document_id: doc.id });
    queued.push({
      documentId: doc.id,
      jobId,
      filename: doc.original_filename,
    });
  }

  kickWorker();

  return NextResponse.json({
    ok: true,
    mode: "document",
    message:
      requestedIds.length > 0
        ? `Re-queued ${queued.length} document(s) from Issues. Wait until Ready, then check Facts/Compare.`
        : "Re-queued extraction for all ready/failed documents. Wait until each shows Ready, then open Compare.",
    queued,
  });
}
