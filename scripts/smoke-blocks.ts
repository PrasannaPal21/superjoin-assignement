/**
 * Inspect Step 2–3 structure: sections + table/narrative blocks.
 * Usage: npx tsx scripts/smoke-blocks.ts [path-to.pdf]
 */
import path from "path";
import { extractPdfPages } from "../src/lib/pdf/parse";
import { applyPageSignals } from "../src/lib/pdf/signal";
import { summarizeSections } from "../src/lib/pdf/structure";
import {
  detectBlocksFromDocument,
  summarizeBlocks,
} from "../src/lib/pdf/tables";

async function main() {
  const pdfPath =
    process.argv[2] || "data/uploads/af9be784-73a0-4aef-8226-475c40e5dcf5.pdf";
  const abs = path.resolve(pdfPath);
  console.log("Parsing", abs);
  const parsed = await extractPdfPages(abs);
  applyPageSignals(parsed.pages);
  const { sections, blocks } = detectBlocksFromDocument(parsed.pages);
  console.log(summarizeSections(sections));
  console.log(summarizeBlocks(blocks));

  const tables = blocks.filter((b) => b.kind === "table").slice(0, 8);
  for (const b of tables) {
    console.log(
      `\n[table #${b.index}] sec="${b.sectionTitle.slice(0, 40)}" p.${b.pageStart}-${b.pageEnd}\n` +
        b.text.slice(0, 220).replace(/\n/g, " | "),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
