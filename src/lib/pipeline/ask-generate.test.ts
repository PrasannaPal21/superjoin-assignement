import { describe, expect, it } from "vitest";
import type { AskContextPack } from "@/lib/pipeline/ask-context";
import {
  extractCitationIndexes,
  generateAskAnswer,
  hardenAskGeneration,
  remapCitationsFromPack,
} from "@/lib/pipeline/ask-generate";

function pack(partial?: Partial<AskContextPack>): AskContextPack {
  return {
    question: "What was FY24 revenue?",
    bestScore: 0.88,
    items: [
      {
        index: 1,
        evidenceId: "e1",
        factId: "f1",
        documentId: "d1",
        documentName: "ar.pdf",
        page: 12,
        quote: "Revenue from operations 8143 crore",
        score: 0.88,
        claim: "Revenue from operations",
        entity: "Delhivery",
        factType: "revenue",
        unit: "crore",
        period: "FY24",
        scope: "consolidated",
        rawValue: "8143",
        sectionTitle: "Highlights",
        parentExcerpt: null,
      },
      {
        index: 2,
        evidenceId: "e2",
        factId: "f2",
        documentId: "d2",
        documentName: "q4.pdf",
        page: 4,
        quote: "Fleet size 12000",
        score: 0.5,
        claim: "Fleet",
        entity: "Delhivery",
        factType: "fleet",
        unit: "vehicles",
        period: "FY24",
        scope: null,
        rawValue: "12000",
        sectionTitle: null,
        parentExcerpt: null,
      },
    ],
    ...partial,
  };
}

describe("Ask grounded generate (stage A4)", () => {
  it("remaps citation indexes onto pack rows (ids/quotes authoritative)", () => {
    const cites = remapCitationsFromPack(pack(), [1, 99, 1, 2]);
    expect(cites).toHaveLength(2);
    expect(cites[0]).toMatchObject({
      factId: "f1",
      evidenceId: "e1",
      quote: "Revenue from operations 8143 crore",
      page: 12,
    });
    expect(cites[1].factId).toBe("f2");
  });

  it("extracts indexes from citationIndexes and citation objects", () => {
    expect(
      extractCitationIndexes({
        refused: false,
        answer: "x",
        citationIndexes: [1],
        citations: [{ index: 2 }],
        confidence: 0.7,
      }),
    ).toEqual([1, 2]);
  });

  it("hardens a good LLM JSON payload", () => {
    const raw = JSON.stringify({
      refused: false,
      answer: "FY24 revenue was 8143 crore.",
      citationIndexes: [1],
      confidence: 0.9,
    });
    const out = hardenAskGeneration(pack(), raw);
    expect(out.refused).toBe(false);
    expect(out.answer).toMatch(/8143/);
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0].factId).toBe("f1");
  });

  it("refuses when citation indexes are missing/invalid", () => {
    const out = hardenAskGeneration(
      pack(),
      JSON.stringify({
        refused: false,
        answer: "Something invented",
        citationIndexes: [99],
      }),
    );
    expect(out.refused).toBe(true);
    expect(out.reason).toMatch(/citation/i);
  });

  it("refuses on garbage JSON without throwing", () => {
    const out = hardenAskGeneration(pack(), "not json {{{");
    expect(out.refused).toBe(true);
  });

  it("honors model refused=true", () => {
    const out = hardenAskGeneration(
      pack(),
      JSON.stringify({
        refused: true,
        reason: "Pack only has fleet figures.",
        citationIndexes: [],
      }),
    );
    expect(out.refused).toBe(true);
    expect(out.reason).toMatch(/fleet/i);
  });

  it("generateAskAnswer uses chatJson dep and hardens", async () => {
    const out = await generateAskAnswer(pack(), {
      chatJson: async () =>
        JSON.stringify({
          refused: false,
          answer: "Revenue was 8143 crore in FY24.",
          citationIndexes: [1],
          confidence: 0.85,
        }),
    });
    expect(out.refused).toBe(false);
    expect(out.citations[0].evidenceId).toBe("e1");
  });

  it("generateAskAnswer refuses empty pack without calling LLM", async () => {
    let called = false;
    const out = await generateAskAnswer(
      { question: "q", items: [], bestScore: 0 },
      {
        chatJson: async () => {
          called = true;
          return "{}";
        },
      },
    );
    expect(called).toBe(false);
    expect(out.refused).toBe(true);
  });
});
