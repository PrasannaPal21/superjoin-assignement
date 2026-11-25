import { NextResponse } from "next/server";
import { getDocument } from "@/lib/db/documents";
import { listFailures } from "@/lib/db/facts";

export const runtime = "nodejs";

export async function GET() {
  const failures = listFailures().map((f) => {
    const doc = f.document_id ? getDocument(f.document_id) : undefined;
    return {
      id: f.id,
      documentId: f.document_id,
      documentName: doc?.original_filename ?? null,
      stage: f.stage,
      summary: f.summary,
      detail: f.detail,
      suggestion: f.suggestion,
      createdAt: f.created_at,
    };
  });
  return NextResponse.json({ failures });
}
