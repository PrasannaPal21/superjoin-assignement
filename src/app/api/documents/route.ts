import { NextResponse } from "next/server";
import { listDocuments } from "@/lib/db/documents";
import { countJobsByStatus } from "@/lib/db/jobs";
import { listFactTypes } from "@/lib/db/facts";
import { kickWorker } from "@/lib/pipeline/worker";

export const runtime = "nodejs";

export async function GET() {
  // Opportunistically drain queue if the process is warm
  kickWorker();

  const documents = listDocuments().map((d) => ({
    id: d.id,
    filename: d.original_filename,
    byteSize: d.byte_size,
    pageCount: d.page_count,
    status: d.status,
    contentHash: d.content_hash,
    errorMessage: d.error_message,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));

  return NextResponse.json({
    documents,
    ops: {
      jobsQueued: countJobsByStatus("queued"),
      jobsRunning: countJobsByStatus("running"),
      jobsFailed: countJobsByStatus("failed"),
      factTypes: listFactTypes(),
    },
  });
}
