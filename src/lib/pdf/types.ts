export type PdfTextSource = "text" | "ocr" | "empty";

export type PdfPage = {
  pageNumber: number;
  text: string;
  /** How the page text was obtained. Defaults to text-layer when omitted. */
  source?: PdfTextSource;
};

export type PdfParseResult = {
  pageCount: number;
  pages: PdfPage[];
  /** Pages that used local Tesseract after a sparse pdf.js text layer. */
  ocrPageCount: number;
  /** Sparse pages that still had no usable text after OCR. */
  emptyPageCount: number;
};
