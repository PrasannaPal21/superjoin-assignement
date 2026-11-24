import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AskEvidenceHit } from "@/lib/embeddings/hybrid-ask";
import { askEvidencePairTexts } from "@/lib/rerank/pair-text";
import { rerankAskEvidence } from "@/lib/pipeline/ask-rerank";

function hit(
  id: string,
  quote: string,
  score = 0.01,
): AskEvidenceHit {
  return {
    evidenceId: id,
    factId: `f-${id}`,
    documentId: "doc",
    page: 1,
    quote,
    score,
    channels: ["sparse"],
  };
}

describe("Ask evidence rerank (stage A2)", () => {
  const prevTop = process.env.ASK_RERANK_TOP_M;
  const prevMin = process.env.ASK_RERANK_MIN_SCORE;

  beforeEach(() => {
    process.env.ASK_RERANK_TOP_M = "2";
    process.env.ASK_RERANK_MIN_SCORE = "0.4";
  });

  afterEach(() => {
    if (prevTop === undefined) delete process.env.ASK_RERANK_TOP_M;
    else process.env.ASK_RERANK_TOP_M = prevTop;
    if (prevMin === undefined) delete process.env.ASK_RERANK_MIN_SCORE;
    else process.env.ASK_RERANK_MIN_SCORE = prevMin;
  });

  it("builds question↔evidence CE pair texts", () => {
    const texts = askEvidencePairTexts("What was FY24 revenue?", {
      page: 12,
      quote: "Revenue from operations 8143 crore",
    });
    expect(texts.query).toContain("revenue");
    expect(texts.doc).toBe("page=12 | Revenue from operations 8143 crore");
  });

  it("keeps top-M above min CE score and reorders", async () => {
    const hits = [
      hit("weak", "Fleet size grew"),
      hit("strong", "Revenue from operations was 8143 crore"),
      hit("mid", "Total income roughly aligned"),
    ];
    const { hits: kept, stats } = await rerankAskEvidence(
      "What was revenue in FY24?",
      hits,
      {
        scoreCe: async () => [0.1, 0.9, 0.5],
      },
    );
    expect(stats.fallback).toBe(false);
    expect(stats.total).toBe(3);
    expect(kept).toHaveLength(2);
    expect(kept[0].evidenceId).toBe("strong");
    expect(kept[0].score).toBeCloseTo(0.9, 5);
    expect(kept[1].evidenceId).toBe("mid");
    expect(kept.map((h) => h.evidenceId)).not.toContain("weak");
  });

  it("falls back to hybrid order when CE throws", async () => {
    const hits = [hit("a", "one"), hit("b", "two"), hit("c", "three")];
    const { hits: kept, stats } = await rerankAskEvidence("q", hits, {
      scoreCe: async () => {
        throw new Error("ce down");
      },
    });
    expect(stats.fallback).toBe(true);
    expect(kept.map((h) => h.evidenceId)).toEqual(["a", "b"]);
  });

  it("returns empty for empty input", async () => {
    const { hits, stats } = await rerankAskEvidence("q", []);
    expect(hits).toEqual([]);
    expect(stats.kept).toBe(0);
  });
});
