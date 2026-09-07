import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getDb } from "@/lib/db/client";
import { getLatestJobForDocument, listDocuments } from "@/lib/db/documents";
import { countJobsByStatus } from "@/lib/db/jobs";
import { listFactTypes } from "@/lib/db/facts";
import { kickWorker } from "@/lib/pipeline/worker";

export const runtime = "nodejs";

function scalar(sql: string): number {
  const row = getDb().prepare(sql).get() as { c: number };
  return row.c;
}

export async function GET() {
  // Opportunistically drain queue if the process is warm
  kickWorker();

  ensureDb();

  const documents = listDocuments().map((d) => {
    const job = getLatestJobForDocument(d.id);
    return {
      id: d.id,
      filename: d.original_filename,
      byteSize: d.byte_size,
      pageCount: d.page_count,
      status: d.status,
      contentHash: d.content_hash,
      errorMessage: d.error_message,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      job: job
        ? {
            id: job.id,
            status: job.status,
            stage: job.progress,
            current: job.progress_current,
            total: job.progress_total,
          }
        : null,
    };
  });

  const factCount = scalar("SELECT COUNT(*) AS c FROM facts WHERE status = 'active'");
  const relationCount = scalar("SELECT COUNT(*) AS c FROM relations");
  const failureCount = scalar("SELECT COUNT(*) AS c FROM failures");

  return NextResponse.json({
    documents,
    ops: {
      jobsQueued: countJobsByStatus("queued"),
      jobsRunning: countJobsByStatus("running"),
      jobsFailed: countJobsByStatus("failed"),
      factTypes: listFactTypes(),
      counts: {
        facts: factCount,
        relations: relationCount,
        failures: failureCount,
      },
    },
  });
}
