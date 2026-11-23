/**
 * Force OCR on page 1 even when a text layer exists — verifies rasterize + Tesseract.
 */
import fs from "fs";
import path from "path";
import { getOcrRenderScale } from "../src/lib/config";
import { ocrImageBuffer, terminateOcrWorker } from "../src/lib/pdf/ocr";
import { renderPdfPageToPng } from "../src/lib/pdf/render-page";

async function main() {
  const pdfPath =
    process.argv[2] || "data/uploads/af9be784-73a0-4aef-8226-475c40e5dcf5.pdf";
  const abs = path.resolve(pdfPath);
  const fileBuf = fs.readFileSync(abs);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(fileBuf),
    useSystemFonts: true,
    disableFontFace: true,
    password: "",
  }).promise;

  const page = await pdf.getPage(1);
  const png = await renderPdfPageToPng(
    page as unknown as Parameters<typeof renderPdfPageToPng>[0],
    getOcrRenderScale(),
  );
  console.log("PNG bytes", png.length);
  const text = await ocrImageBuffer(png);
  console.log("OCR chars", text.length);
  console.log("OCR preview", text.slice(0, 240));
  await terminateOcrWorker();
}

main().catch(async (err) => {
  console.error(err);
  await terminateOcrWorker();
  process.exit(1);
});
