import fs from "fs";
import { getMaxPages } from "@/lib/config";
import type { PdfPage, PdfParseResult } from "./types";

/**
 * Extract plain text per page. Uses pdf.js legacy build (Node-friendly).
 * Scanned image-only pages may yield empty strings — that's expected without OCR.
 */
export async function extractPdfPages(filePath: string): Promise<PdfParseResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file missing on disk: ${filePath}`);
  }

  const fileBuf = fs.readFileSync(filePath);
  if (fileBuf.length < 5) {
    throw new Error("PDF file is empty or truncated");
  }
  if (fileBuf.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("Stored file is not a PDF");
  }

  const data = new Uint8Array(fileBuf);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  let pdf;
  try {
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      // password-protected docs should fail clearly
      password: "",
    });
    pdf = await loadingTask.promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : "pdf parse failed";
    if (/password/i.test(message)) {
      throw new Error("PDF is password-protected");
    }
    throw new Error(`Unable to parse PDF: ${message}`);
  }

  const maxPages = getMaxPages();
  const pageCount = pdf.numPages;
  if (pageCount < 1) {
    throw new Error("PDF reports zero pages");
  }

  const limit = Math.min(pageCount, maxPages);
  const pages: PdfPage[] = [];

  for (let i = 1; i <= limit; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings: string[] = [];
      for (const item of content.items) {
        if (item && typeof item === "object" && "str" in item) {
          const str = (item as { str?: string }).str;
          if (str) strings.push(str);
        }
      }
      const text = strings.join(" ").replace(/\s+/g, " ").trim();
      pages.push({ pageNumber: i, text });
    } catch {
      // Keep going — one bad page shouldn't kill the whole document
      pages.push({ pageNumber: i, text: "" });
    }
  }

  return { pageCount, pages };
}
