"use client";

/**
 * Single source of truth for uploading PDFs from the UI.
 * Used by both the sidebar button and the global drop-anywhere overlay.
 */

export type UploadResult = {
  document: { id: string; filename: string };
  deduped?: boolean;
};

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function uploadPdf(file: File): Promise<UploadResult> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data as UploadResult;
}
