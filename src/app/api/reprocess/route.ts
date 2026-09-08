import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { listDocuments, updateDocumentStatus, insertJob } from "@/lib/db/documents";
import { clearDocumentKnowledge } from "@/lib/db/facts";
import { kickWorker } from "@/lib/pipeline/worker";

export const runtime = "nodejs";

/**
 * Wipe facts for ready/failed docs and re-queue extraction + matching.
 * Use after rate-limit sparse runs so Compare can fill in.
 */
export async function POST() {
  const docs = listDocuments().filter(
    (d) => d.status === "ready" || d.status === "failed",
  );

  if (docs.length === 0) {
    return NextResponse.json({ error: "No ready/failed documents to reprocess" }, { status: 400 });
  }

  const queued: { documentId: string; jobId: string; filename: string }[] = [];

  // Oldest first so later docs match against earlier facts.
  const ordered = [...docs].sort((a, b) => a.created_at.localeCompare(b.created_at));

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
    message:
      "Re-queued extraction for all ready/failed documents. Wait until each shows Ready, then open Compare.",
    queued,
  });
}
