import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ASK_GATE_GOLDENS,
  ASK_HARDEN_GOLDENS,
  ASK_ORCH_GOLDENS,
  evalAskGateGoldens,
  evalAskHardenGoldens,
  evalAskOrchGoldens,
  scoreAskEval,
} from "@/lib/pipeline/ask-fixtures";

describe("Ask golden fixtures (stage A7)", () => {
  const prev = {
    topM: process.env.ASK_RERANK_TOP_M,
    minCe: process.env.ASK_RERANK_MIN_SCORE,
    refuseScore: process.env.ASK_REFUSE_MIN_SCORE,
    refuseHits: process.env.ASK_REFUSE_MIN_HITS,
  };

  beforeEach(() => {
    process.env.ASK_RERANK_TOP_M = "8";
    process.env.ASK_RERANK_MIN_SCORE = "0.35";
    process.env.ASK_REFUSE_MIN_SCORE = "0.4";
    process.env.ASK_REFUSE_MIN_HITS = "1";
  });

  afterEach(() => {
    for (const [k, v] of [
      ["ASK_RERANK_TOP_M", prev.topM],
      ["ASK_RERANK_MIN_SCORE", prev.minCe],
      ["ASK_REFUSE_MIN_SCORE", prev.refuseScore],
      ["ASK_REFUSE_MIN_HITS", prev.refuseHits],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("covers refuse and answer orch kinds", () => {
    const kinds = new Set(ASK_ORCH_GOLDENS.map((c) => c.kind));
    expect(kinds.has("refuse")).toBe(true);
    expect(kinds.has("answer")).toBe(true);
    expect(ASK_GATE_GOLDENS.length).toBeGreaterThan(0);
    expect(ASK_HARDEN_GOLDENS.length).toBeGreaterThan(0);
  });

  it("gate goldens score 100%", () => {
    const rows = evalAskGateGoldens();
    const score = scoreAskEval(rows);
    expect(rows.filter((r) => !r.ok), JSON.stringify(rows)).toEqual([]);
    expect(score.accuracy).toBe(1);
  });

  it("harden goldens score 100%", () => {
    const rows = evalAskHardenGoldens();
    expect(rows.filter((r) => !r.ok), JSON.stringify(rows)).toEqual([]);
    expect(scoreAskEval(rows).accuracy).toBe(1);
  });

  it("orchestrator goldens score 100% (mocked, offline)", async () => {
    const rows = await evalAskOrchGoldens();
    expect(rows.filter((r) => !r.ok), JSON.stringify(rows)).toEqual([]);
    expect(scoreAskEval(rows).accuracy).toBe(1);
  });
});
