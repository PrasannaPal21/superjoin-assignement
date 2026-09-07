import { NextResponse } from "next/server";
import { listFailures } from "@/lib/db/facts";

export const runtime = "nodejs";

export async function GET() {
  const failures = listFailures().map((f) => ({
    id: f.id,
    documentId: f.document_id,
    stage: f.stage,
    summary: f.summary,
    detail: f.detail,
    suggestion: f.suggestion,
    createdAt: f.created_at,
  }));
  return NextResponse.json({ failures });
}
