import { NextRequest, NextResponse } from "next/server";
import { getDocument, getJob, getLatestJobForDocument } from "@/lib/db/documents";
import { kickWorker } from "@/lib/pipeline/worker";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  kickWorker();
  const { id } = await ctx.params;
  const byDoc = req.nextUrl.searchParams.get("by") === "document";

  const job = byDoc ? getLatestJobForDocument(id) : getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const doc = getDocument(job.document_id);

  return NextResponse.json({
    job: {
      id: job.id,
      documentId: job.document_id,
      status: job.status,
      progress: job.progress,
      progressCurrent: job.progress_current,
      progressTotal: job.progress_total,
      errorMessage: job.error_message,
      attempts: job.attempts,
      createdAt: job.created_at,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
    },
    document: doc
      ? {
          id: doc.id,
          filename: doc.original_filename,
          status: doc.status,
          pageCount: doc.page_count,
          errorMessage: doc.error_message,
        }
      : null,
  });
}
