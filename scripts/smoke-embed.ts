/**
 * Smoke-test free local embeddings (Xenova/all-MiniLM-L6-v2).
 * First run downloads the model (~25MB) into .cache/embeddings.
 *
 * Usage: npx tsx scripts/smoke-embed.ts
 */
import { buildFactCard } from "../src/lib/embeddings/index-text";
import {
  cosineSimilarity,
  embedTexts,
  isEmbeddingsConfigured,
} from "../src/lib/embeddings/client";

async function main() {
  if (!isEmbeddingsConfigured()) {
    console.error("Embeddings not configured.");
    process.exit(1);
  }

  const a = buildFactCard({
    entity: "Delhivery",
    factType: "revenue",
    claim: "Revenue from operations",
    rawValue: "8143",
    unit: "crore",
    period: "FY24",
  });
  const b = buildFactCard({
    entity: "Delhivery",
    factType: "revenue",
    claim: "Total income from operations",
    rawValue: "8143",
    unit: "crore",
    period: "FY24",
  });
  const c = buildFactCard({
    entity: "Delhivery",
    factType: "pin_code_coverage",
    claim: "Pin codes served",
    rawValue: "18000",
    period: "FY24",
  });

  console.log("Loading local embedding model (first run may download)...");
  const { vectors, model, dimensions, provider } = await embedTexts([a, b, c]);
  console.log({ provider, model, dimensions, count: vectors.length });
  console.log(
    "sim(revenue paraphrase)",
    cosineSimilarity(vectors[0], vectors[1]).toFixed(4),
  );
  console.log(
    "sim(revenue vs pin codes)",
    cosineSimilarity(vectors[0], vectors[2]).toFixed(4),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
