import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getMaxUploadBytes, getUploadDir, resolveUnderRoot } from "@/lib/config";
import { insertDocument, insertJob } from "@/lib/db/documents";
import { takeToken } from "@/lib/security/rate-limit";
import {
  assertPdfMime,
  hasPdfMagicBytes,
  looksLikePdfFilename,
  sanitizeFilename,
} from "@/lib/security/upload-validate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  if (!takeToken(`upload:${ip}`, { capacity: 8, refillPerMs: 60_000 / 8 })) {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  const original = sanitizeFilename(file.name || "upload.pdf");
  if (!looksLikePdfFilename(original)) {
    return NextResponse.json({ error: "Only PDF uploads are accepted" }, { status: 400 });
  }

  if (!assertPdfMime(file.type)) {
    return NextResponse.json({ error: "Unexpected content type for PDF" }, { status: 400 });
  }

  const maxBytes = getMaxUploadBytes();
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File exceeds max size of ${Math.round(maxBytes / (1024 * 1024))}MB` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasPdfMagicBytes(buffer)) {
    return NextResponse.json(
      { error: "File content is not a valid PDF (magic bytes check failed)" },
      { status: 400 },
    );
  }

  const docId = randomUUID();
  const jobId = randomUUID();
  const uploadDir = resolveUnderRoot(getUploadDir());
  fs.mkdirSync(uploadDir, { recursive: true });

  const storedName = `${docId}.pdf`;
  const storedPath = path.join(uploadDir, storedName);
  fs.writeFileSync(storedPath, buffer);

  const contentHash = createHash("sha256").update(buffer).digest("hex");

  const doc = insertDocument({
    id: docId,
    original_filename: original,
    stored_path: storedPath,
    mime_type: "application/pdf",
    byte_size: buffer.length,
    content_hash: contentHash,
    status: "queued",
  });

  const job = insertJob({ id: jobId, document_id: docId });

  // Start background processing without blocking the response
  const { kickWorker } = await import("@/lib/pipeline/worker");
  kickWorker();

  return NextResponse.json(
    {
      document: {
        id: doc.id,
        filename: doc.original_filename,
        byteSize: doc.byte_size,
        status: doc.status,
        contentHash: doc.content_hash,
      },
      job: { id: job.id, status: job.status },
    },
    { status: 201 },
  );
}
