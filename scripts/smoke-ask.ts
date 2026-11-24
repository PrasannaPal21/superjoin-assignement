/**
 * Offline smoke for Ask goldens (A7).
 * No MiniLM download / no live Groq — mocked retrieve, CE, chatJson.
 *
 * Usage: npx tsx scripts/smoke-ask.ts
 */
import {
  evalAskGateGoldens,
  evalAskHardenGoldens,
  evalAskOrchGoldens,
  scoreAskEval,
  type AskEvalRow,
} from "../src/lib/pipeline/ask-fixtures";

function print(label: string, rows: AskEvalRow[]) {
  console.log(`\n${label}`);
  for (const row of rows) {
    console.log(`[${row.ok ? "ok" : "FAIL"}] ${row.id} → ${row.detail}`);
  }
  const s = scoreAskEval(rows);
  console.log(`accuracy ${s.correct}/${s.total} (${(s.accuracy * 100).toFixed(0)}%)`);
  return s;
}

async function main() {
  process.env.ASK_RERANK_TOP_M = process.env.ASK_RERANK_TOP_M || "8";
  process.env.ASK_RERANK_MIN_SCORE = process.env.ASK_RERANK_MIN_SCORE || "0.35";
  process.env.ASK_REFUSE_MIN_SCORE = process.env.ASK_REFUSE_MIN_SCORE || "0.4";
  process.env.ASK_REFUSE_MIN_HITS = process.env.ASK_REFUSE_MIN_HITS || "1";

  const gate = print("Ask gate goldens", evalAskGateGoldens());
  const harden = print("Ask harden goldens", evalAskHardenGoldens());
  const orch = print("Ask orchestrator goldens", await evalAskOrchGoldens());

  const total = gate.total + harden.total + orch.total;
  const correct = gate.correct + harden.correct + orch.correct;
  console.log(
    `\nAsk smoke total ${correct}/${total} (${total ? ((correct / total) * 100).toFixed(0) : 0}%)`,
  );

  if (correct < total) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
