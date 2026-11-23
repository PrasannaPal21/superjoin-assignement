import { describe, expect, it } from "vitest";
import {
  applyCascadeBands,
  assignCeBand,
  blendCeLlm,
  selectMidBandIndexes,
} from "@/lib/rerank/cascade";
import { normalizeCeScore } from "@/lib/rerank/cross-encoder";
import { rerankFactPairs } from "@/lib/pipeline/rerank";
import type { FactPair } from "@/lib/pipeline/match-candidates";
import type { FactRow } from "@/lib/db/facts";

function fact(id: string, claim: string): FactRow {
  return {
    id,
    document_id: id.startsWith("l") ? "doc-new" : "doc-old",
    chunk_id: null,
    claim,
    raw_value: "1",
    numeric_value: 1,
    unit: "crore",
    period: "FY24",
    scope: null,
    entity: "Delhivery",
    fact_type: "revenue",
    confidence: 0.9,
    status: "active",
    match_key: "delhivery|revenue|crore",
    created_at: "",
  };
}

function pair(leftId: string, rightId: string, claimL: string, claimR: string): FactPair {
  return {
    left: fact(leftId, claimL),
    right: fact(rightId, claimR),
    reason: "hybrid:test",
    score: 0.02,
  };
}

describe("cascade rerank", () => {
  it("assigns CE bands and blends mid scores", () => {
    expect(assignCeBand(0.9, 0.35, 0.72)).toBe("accept");
    expect(assignCeBand(0.1, 0.35, 0.72)).toBe("reject");
    expect(assignCeBand(0.5, 0.35, 0.72)).toBe("mid");
    expect(blendCeLlm(0.5, 0.9, 0.6)).toBeCloseTo(0.66, 5);
  });

  it("normalizes CE logits into [0,1]", () => {
    expect(normalizeCeScore(0.8)).toBeCloseTo(0.8, 5);
    expect(normalizeCeScore({ score: 0.2 })).toBeCloseTo(0.2, 5);
    expect(normalizeCeScore({ score: 2.2 })).toBeGreaterThan(0.8);
  });

  it("accepts high CE, rejects low, LLM only on mid", () => {
    const items = ["a", "b", "c", "d"];
    const ceScores = [0.9, 0.1, 0.5, 0.55];
    const llmScores = [null, null, 0.8, null]; // only c scored by LLM
    const { kept, stats } = applyCascadeBands({
      items,
      ceScores,
      llmScores,
      low: 0.35,
      high: 0.72,
      alpha: 0.6,
      minScore: 0.35,
      topM: 10,
    });

    expect(stats.accepted).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.mid).toBe(2);
    expect(stats.llmUsed).toBe(1);
    expect(kept.map((k) => k.item)).toContain("a");
    expect(kept.map((k) => k.item)).not.toContain("b");
    const midC = kept.find((k) => k.item === "c");
    expect(midC?.usedLlm).toBe(true);
    expect(midC?.finalScore).toBeCloseTo(0.6 * 0.5 + 0.4 * 0.8, 5);
  });

  it("caps mid-band LLM indexes by budget", () => {
    const ce = [0.5, 0.6, 0.4, 0.9, 0.1];
    const mid = selectMidBandIndexes(ce, {
      low: 0.35,
      high: 0.72,
      maxLlm: 2,
    });
    expect(mid).toEqual([1, 0]); // highest CE mids first
  });

  it("rerankFactPairs cascade uses CE for most and LLM for mid only", async () => {
    const prev = process.env.RERANK_PROVIDER;
    process.env.RERANK_PROVIDER = "cascade";
    process.env.CE_HIGH = "0.72";
    process.env.CE_LOW = "0.35";
    process.env.RERANK_MIN_SCORE = "0.35";
    process.env.RERANK_TOP_M = "5";
    process.env.RERANK_CE_BLEND = "0.6";

    const pairs = [
      pair("l1", "r1", "Revenue from operations", "Revenue from operations"),
      pair("l2", "r2", "Revenue", "Fleet size"),
      pair("l3", "r3", "Top-line sales", "Revenue from operations"),
    ];

    // CE: accept / reject / mid
    const ceScores = [0.91, 0.12, 0.5];
    let llmCalls = 0;
    const result = await rerankFactPairs(pairs, {
      scoreCe: async () => ceScores,
      scoreLlm: async (batch) => {
        llmCalls += batch.length;
        return batch.map(() => 0.85);
      },
    });

    expect(llmCalls).toBe(1);
    expect(result.stats.llmUsed).toBe(1);
    expect(result.stats.accepted).toBe(1);
    expect(result.stats.rejected).toBe(1);
    expect(result.pairs.some((p) => p.left.id === "l2")).toBe(false);
    expect(result.pairs.some((p) => p.left.id === "l1")).toBe(true);
    expect(result.pairs.some((p) => p.left.id === "l3")).toBe(true);

    if (prev === undefined) delete process.env.RERANK_PROVIDER;
    else process.env.RERANK_PROVIDER = prev;
  });
});
