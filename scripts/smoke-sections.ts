/**
 * Inspect Step 2 section detection on a stored PDF.
 * Usage: npx tsx scripts/smoke-sections.ts [path-to.pdf]
 */
import path from "path";
import { extractPdfPages } from "../src/lib/pdf/parse";
import { applyPageSignals } from "../src/lib/pdf/signal";
import {
  detectSectionsFromDocument,
  summarizeSections,
} from "../src/lib/pdf/structure";

async function main() {
  const pdfPath =
    process.argv[2] || "data/uploads/af9be784-73a0-4aef-8226-475c40e5dcf5.pdf";
  const abs = path.resolve(pdfPath);
  console.log("Parsing", abs);
  const parsed = await extractPdfPages(abs);
  applyPageSignals(parsed.pages);
  const sections = detectSectionsFromDocument(parsed.pages);
  console.log(summarizeSections(sections));
  for (const s of sections.slice(0, 12)) {
    console.log(
      `\n[#${s.index}] p.${s.pageStart}-${s.pageEnd}  ${s.title}\n` +
        s.text.slice(0, 160).replace(/\n/g, " "),
    );
  }
  if (sections.length > 12) {
    console.log(`\n… ${sections.length - 12} more sections`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
