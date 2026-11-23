import path from "path";
import { extractPdfPages } from "../src/lib/pdf/parse";

async function main() {
  const pdfPath =
    process.argv[2] || "data/uploads/af9be784-73a0-4aef-8226-475c40e5dcf5.pdf";
  const abs = path.resolve(pdfPath);
  console.log("Parsing", abs);
  const r = await extractPdfPages(abs);
  const nonempty = r.pages.filter((p) => p.text.length >= 40).length;
  console.log({
    pageCount: r.pageCount,
    ocrPageCount: r.ocrPageCount,
    emptyPageCount: r.emptyPageCount,
    nonempty,
    sampleSource: r.pages[0]?.source,
    sampleLen: r.pages[0]?.text?.length,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
