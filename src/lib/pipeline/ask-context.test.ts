import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AskEvidenceHit } from "@/lib/embeddings/hybrid-ask";
import type { FactRow } from "@/lib/db/facts";
import type { ChunkRow } from "@/lib/db/chunks";
import {
  buildAskContextPack,
  citationsFromPack,
  decideAskRefuse,
  formatAskContextForPrompt,
  gateAskContext,
} from "@/lib/pipeline/ask-context";

function hit(
  id: string,
  score: number,
  quote = `quote-${id}`,
): AskEvidenceHit {
  return {
    evidenceId: `e-${id}`,
    factId: `f-${id}`,
    documentId: `d-${id}`,
    page: 3,
    quote,
    score,
    channels: ["dense"],
  };
}

function fact(id: string): FactRow {
  return {
    id: `f-${id}`,
    document_id: `d-${id}`,
    chunk_id: `c-${id}`,
    claim: `Claim ${id}`,
    raw_value: "8143",
    numeric_value: 8143,
    unit: "crore",
    period: "FY24",
    scope: "consolidated",
    entity: "Delhivery",
    fact_type: "revenue",
    confidence: 0.9,
    status: "active",
    match_key: "delhivery|revenue|crore",
    created_at: "",
  };
}

function chunk(
  id: string,
  opts: Partial<ChunkRow> = {},
): ChunkRow {
  return {
    id,
    document_id: "d",
    page_start: 1,
    page_end: 2,
    text: opts.text ?? "child text",
    token_estimate: 10,
    kind: opts.kind ?? "child",
    parent_id: opts.parent_id ?? null,
    section_title: opts.section_title ?? null,
    block_kind: opts.block_kind ?? "narrative",
    created_at: "",
    ...opts,
  };
}

describe("Ask context + refuse gate (stage A3)", () => {
  const prevScore = process.env.ASK_REFUSE_MIN_SCORE;
  const prevHits = process.env.ASK_REFUSE_MIN_HITS;

  beforeEach(() => {
    process.env.ASK_REFUSE_MIN_SCORE = "0.4";
    process.env.ASK_REFUSE_MIN_HITS = "1";
  });

  afterEach(() => {
    if (prevScore === undefined) delete process.env.ASK_REFUSE_MIN_SCORE;
    else process.env.ASK_REFUSE_MIN_SCORE = prevScore;
    if (prevHits === undefined) delete process.env.ASK_REFUSE_MIN_HITS;
    else process.env.ASK_REFUSE_MIN_HITS = prevHits;
  });

  it("refuses empty retrieval", () => {
    const r = decideAskRefuse([]);
    expect(r?.refuse).toBe(true);
    expect(r?.reason).toMatch(/No evidence/i);
  });

  it("refuses when all scores are below the floor", () => {
    const r = decideAskRefuse([hit("a", 0.2), hit("b", 0.3)]);
    expect(r?.refuse).toBe(true);
    expect(r?.bestScore).toBeCloseTo(0.3, 5);
    expect(r?.hitCount).toBe(0);
  });

  it("refuses when eligible hits < minHits", () => {
    process.env.ASK_REFUSE_MIN_HITS = "2";
    const r = decideAskRefuse([hit("a", 0.9)]);
    expect(r?.refuse).toBe(true);
    expect(r?.hitCount).toBe(1);
  });

  it("packs fact metadata and optional parent excerpt", () => {
    const chunks: Record<string, ChunkRow> = {
      "c-a": chunk("c-a", {
        parent_id: "p-a",
        section_title: "Financial highlights",
      }),
      "p-a": chunk("p-a", {
        kind: "parent",
        text: "Parent section discussing FY24 revenue from operations across segments.",
      }),
    };

    const pack = buildAskContextPack(
      "What was FY24 revenue?",
      [hit("a", 0.85, "Revenue from operations 8143 crore")],
      {
        getFact: (id) => (id === "f-a" ? fact("a") : null),
        getDocumentName: () => "ar-fy24.pdf",
        getChunk: (id) => chunks[id] ?? null,
      },
    );

    expect(pack.items).toHaveLength(1);
    expect(pack.bestScore).toBeCloseTo(0.85, 5);
    const item = pack.items[0];
    expect(item.claim).toBe("Claim a");
    expect(item.entity).toBe("Delhivery");
    expect(item.period).toBe("FY24");
    expect(item.documentName).toBe("ar-fy24.pdf");
    expect(item.sectionTitle).toBe("Financial highlights");
    expect(item.parentExcerpt).toMatch(/Parent section/);
  });

  it("gateAskContext returns pack when confident", () => {
    const gated = gateAskContext(
      "q",
      [hit("a", 0.7)],
      {
        getFact: () => fact("a"),
        getDocumentName: () => "doc.pdf",
        getChunk: () => null,
      },
    );
    expect(gated.refuse).toBe(false);
    if (gated.refuse) return;
    expect(gated.pack.items[0].factId).toBe("f-a");
    const cites = citationsFromPack(gated.pack);
    expect(cites[0]).toMatchObject({
      factId: "f-a",
      documentId: "d-a",
      quote: "quote-a",
    });
  });

  it("formats a prompt block with indexes", () => {
    const pack = buildAskContextPack(
      "Revenue?",
      [hit("a", 0.8, "8143 crore")],
      {
        getFact: () => fact("a"),
        getDocumentName: () => "x.pdf",
        getChunk: () => null,
      },
    );
    const text = formatAskContextForPrompt(pack);
    expect(text).toContain("Question: Revenue?");
    expect(text).toContain("[1]");
    expect(text).toContain("quote: 8143 crore");
    expect(text).toContain("factId=f-a");
  });
});
