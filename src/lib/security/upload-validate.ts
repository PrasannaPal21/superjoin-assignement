/** Basic filename / extension checks. Magic-byte validation is layered on separately. */

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || "upload.pdf";
  return base.replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
}

export function looksLikePdfFilename(name: string): boolean {
  return /\.pdf$/i.test(name);
}

export function assertPdfMime(mime: string | null | undefined): boolean {
  if (!mime) return true; // browsers sometimes omit; filename + magic bytes cover this
  const normalized = mime.toLowerCase();
  return (
    normalized === "application/pdf" ||
    normalized === "application/x-pdf" ||
    normalized === "application/octet-stream"
  );
}
