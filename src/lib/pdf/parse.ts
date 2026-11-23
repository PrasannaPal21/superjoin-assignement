import fs from "fs";
import {
  getMaxPages,
  getOcrConcurrency,
  getOcrMaxPages,
  getOcrMinTextChars,
  getOcrRenderScale,
  isOcrEnabled,
} from "@/lib/config";
import { ocrImageBuffer } from "@/lib/pdf/ocr";
import { renderPdfPageToPng } from "@/lib/pdf/render-page";
import { mapPool } from "@/lib/pipeline/pool";
import type { PdfPage, PdfParseResult } from "./types";

/**
 * Build page text while preserving line breaks when pdf.js exposes them.
 * Newlines make Step 2 section heading detection reliable.
 */
function pageTextFromContent(content: { items: unknown[] }): string {
  const parts: string[] = [];
  let prevY: number | null = null;

  for (const item of content.items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const row = item as {
      str?: string;
      hasEOL?: boolean;
      transform?: number[];
    };
    const str = row.str;
    if (!str) continue;

    const y =
      Array.isArray(row.transform) && typeof row.transform[5] === "number"
        ? row.transform[5]
        : null;

    // New visual line when Y jumps (pdf.js y grows upward; use absolute delta).
    if (prevY != null && y != null && Math.abs(y - prevY) > 2) {
      parts.push("\n");
    } else if (parts.length > 0 && !parts[parts.length - 1].endsWith("\n")) {
      parts.push(" ");
    }

    parts.push(str);
    if (row.hasEOL) parts.push("\n");
    if (y != null) prevY = y;
  }

  return parts
    .join("")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract plain text per page via pdf.js.
 * Sparse / image-only pages are OCR'd locally with Tesseract (no LLM tokens)
 * when OCR_ENABLED is on (default).
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
  const minChars = getOcrMinTextChars();
  const pages: PdfPage[] = [];

  for (let i = 1; i <= limit; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = pageTextFromContent(content);
      pages.push({
        pageNumber: i,
        text,
        source: text.length >= minChars ? "text" : "empty",
      });
    } catch {
      pages.push({ pageNumber: i, text: "", source: "empty" });
    }
  }

  const sparseIndexes = pages
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => (p.text?.length ?? 0) < minChars)
    .map(({ idx }) => idx);

  let ocrPageCount = 0;

  if (isOcrEnabled() && sparseIndexes.length > 0) {
    const toOcr = sparseIndexes.slice(0, getOcrMaxPages());
    const scale = getOcrRenderScale();

    const ocrHits = await mapPool(toOcr, getOcrConcurrency(), async (pageIndex) => {
      const pageNumber = pages[pageIndex].pageNumber;
      try {
        const page = await pdf.getPage(pageNumber);
        const png = await renderPdfPageToPng(
          page as unknown as Parameters<typeof renderPdfPageToPng>[0],
          scale,
        );
        const ocrText = await ocrImageBuffer(png);
        if (ocrText.length >= minChars) {
          pages[pageIndex] = {
            pageNumber,
            text: ocrText,
            source: "ocr",
          };
          return true;
        }
        if (ocrText.length > (pages[pageIndex].text?.length ?? 0)) {
          // Keep partial OCR if it beats an empty text layer.
          pages[pageIndex] = {
            pageNumber,
            text: ocrText,
            source: ocrText ? "ocr" : "empty",
          };
          return Boolean(ocrText);
        }
      } catch {
        // Leave the page as-is; worker decides whether the doc is usable.
      }
      return false;
    });
    ocrPageCount = ocrHits.filter(Boolean).length;
  }

  const emptyPageCount = pages.filter(
    (p) => !p.text || p.text.length < minChars,
  ).length;

  return { pageCount, pages, ocrPageCount, emptyPageCount };
}
