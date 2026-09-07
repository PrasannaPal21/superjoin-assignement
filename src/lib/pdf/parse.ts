import fs from "fs";
import { getMaxPages } from "@/lib/config";
import type { PdfPage, PdfParseResult } from "./types";

/**
 * Extract plain text per page. Uses pdf.js legacy build (Node-friendly).
 * Scanned image-only pages may yield empty strings — that's expected without OCR.
 */
export async function extractPdfPages(filePath: string): Promise<PdfParseResult> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  // Dynamic import keeps Next from bundling the worker incorrectly.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  const maxPages = getMaxPages();
  const pageCount = pdf.numPages;
  const limit = Math.min(pageCount, maxPages);
  const pages: PdfPage[] = [];

  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings: string[] = [];
    for (const item of content.items) {
      if (item && typeof item === "object" && "str" in item) {
        const str = (item as { str?: string }).str;
        if (str) strings.push(str);
      }
    }
    // Heuristic: join with spaces; collapse noisy whitespace
    const text = strings.join(" ").replace(/\s+/g, " ").trim();
    pages.push({ pageNumber: i, text });
  }

  return { pageCount, pages };
}
