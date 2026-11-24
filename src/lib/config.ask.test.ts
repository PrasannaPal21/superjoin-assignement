import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAskConfig,
  getAskRefuseMinHits,
  getAskRefuseMinScore,
  getAskRerankMinScore,
  getAskRerankTopM,
  getAskRrfTopN,
  getAskSparseTopK,
  getGroqAskModel,
} from "@/lib/config";

describe("Ask config (stage A1)", () => {
  const keys = [
    "GROQ_ASK_MODEL",
    "GROQ_MODEL",
    "ASK_SPARSE_TOP_K",
    "SPARSE_TOP_K",
    "ASK_RRF_TOP_N",
    "RRF_TOP_N",
    "ASK_RERANK_TOP_M",
    "RERANK_TOP_M",
    "ASK_RERANK_MIN_SCORE",
    "RERANK_MIN_SCORE",
    "ASK_REFUSE_MIN_SCORE",
    "ASK_REFUSE_MIN_HITS",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("falls back Ask model to GROQ_MODEL", () => {
    delete process.env.GROQ_ASK_MODEL;
    process.env.GROQ_MODEL = "openai/gpt-oss-120b";
    expect(getGroqAskModel()).toBe("openai/gpt-oss-120b");
    process.env.GROQ_ASK_MODEL = "openai/gpt-oss-20b";
    expect(getGroqAskModel()).toBe("openai/gpt-oss-20b");
  });

  it("prefers ASK_* caps over Compare defaults", () => {
    process.env.SPARSE_TOP_K = "20";
    process.env.ASK_SPARSE_TOP_K = "12";
    expect(getAskSparseTopK()).toBe(12);
    process.env.RRF_TOP_N = "30";
    process.env.ASK_RRF_TOP_N = "15";
    expect(getAskRrfTopN()).toBe(15);
    process.env.RERANK_TOP_M = "12";
    process.env.ASK_RERANK_TOP_M = "6";
    expect(getAskRerankTopM()).toBe(6);
  });

  it("clamps refuse / min scores to [0,1]", () => {
    process.env.ASK_REFUSE_MIN_SCORE = "1.5";
    expect(getAskRefuseMinScore()).toBe(1);
    process.env.ASK_REFUSE_MIN_SCORE = "-0.1";
    expect(getAskRefuseMinScore()).toBe(0);
    process.env.ASK_RERANK_MIN_SCORE = "2";
    expect(getAskRerankMinScore()).toBe(1);
  });

  it("enforces refuseMinHits >= 1", () => {
    process.env.ASK_REFUSE_MIN_HITS = "0";
    expect(getAskRefuseMinHits()).toBe(1);
    process.env.ASK_REFUSE_MIN_HITS = "3";
    expect(getAskRefuseMinHits()).toBe(3);
  });

  it("exposes ask config snapshot", () => {
    process.env.GROQ_ASK_MODEL = "openai/gpt-oss-20b";
    process.env.ASK_SPARSE_TOP_K = "10";
    process.env.ASK_REFUSE_MIN_SCORE = "0.45";
    process.env.ASK_REFUSE_MIN_HITS = "2";
    const snap = getAskConfig();
    expect(snap.askModel).toBe("openai/gpt-oss-20b");
    expect(snap.sparseTopK).toBe(10);
    expect(snap.refuseMinScore).toBeCloseTo(0.45, 5);
    expect(snap.refuseMinHits).toBe(2);
  });
});
