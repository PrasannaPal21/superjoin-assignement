import { createCanvas, type Canvas } from "@napi-rs/canvas";

/**
 * Rasterize a pdf.js page to PNG for OCR.
 * Uses @napi-rs/canvas so Node does not need a browser DOM.
 */
export async function renderPdfPageToPng(
  // pdf.js PDFPageProxy — kept loose to avoid brittle RenderParameters generics.
  page: {
    getViewport: (params: { scale: number }) => { width: number; height: number };
    render: (params: Record<string, unknown>) => { promise: Promise<void> };
  },
  scale: number,
): Promise<Buffer> {
  const viewport = page.getViewport({ scale });
  const width = Math.max(1, Math.ceil(viewport.width));
  const height = Math.max(1, Math.ceil(viewport.height));
  const canvas: Canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  // White background — scanned pages with transparency read better in Tesseract.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  await page
    .render({
      canvasContext: context,
      viewport,
      canvas,
    })
    .promise;

  return canvas.toBuffer("image/png");
}
