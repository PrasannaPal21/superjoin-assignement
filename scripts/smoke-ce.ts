import { scorePairsWithCrossEncoder } from "../src/lib/rerank/cross-encoder";

async function main() {
  console.log("Loading local cross-encoder (raw logits)...");
  const scores = await scorePairsWithCrossEncoder([
    {
      query: "What is revenue?",
      doc: "Revenue was 100 million in FY24.",
    },
    {
      query: "What is revenue?",
      doc: "The weather is sunny today.",
    },
    {
      query: "Delhivery FY24 revenue crore",
      doc: "Revenue from operations was Rs 8,143 crore in FY24.",
    },
    {
      query: "Delhivery FY24 revenue crore",
      doc: "Pin codes served exceeded 18,000 across India.",
    },
  ]);
  console.log({
    revenueVsRevenue: scores[0],
    revenueVsWeather: scores[1],
    delhiveryRevenue: scores[2],
    delhiveryPins: scores[3],
    ranksOk: scores[0] > scores[1] && scores[2] > scores[3],
  });
  if (!(scores[0] > scores[1] && scores[2] > scores[3])) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
