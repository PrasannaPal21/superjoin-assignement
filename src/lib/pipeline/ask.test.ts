import { describe, expect, it } from "vitest";
import type { AskEvidenceHit } from "@/lib/embeddings/hybrid-ask";
import type { FactRow } from "@/lib/db/facts";
import { askQuestion } from "@/lib/pipeline/ask";

function hit(
  id: string,
  score: number,
  quote: string,
): AskEvidenceHit {
  return {
    evidenceId: `e-${id}`,
    factId: `f-${id}`,
    documentId: `d-${id}`,
    page: 10,
    quote,
    score,
    channels: ["sparse", "dense"],
  };
}

function fact(id: string): FactRow {
  return {
    id: `f-${id}`,
    document_id: `d-${id}`,
    chunk_id: null,
    claim: `Claim ${id}`,
    raw_value: "8143",
    numeric_value: 8143,
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

describe("askQuestion orchestrator (stage A5)", () => {
  it("refuses empty questions without retrieval", async () => {
    let retrieved = false;
    const out = await askQuestion("   ", {}, {
      retrieve: async () => {
        retrieved = true;
        return [];
      },
    });
    expect(retrieved).toBe(false);
    expect(out.refused).toBe(true);
    expect(out.stats.refusedAt).toBe("retrieve");
  });

  it("refuses at gate when retrieval is weak", async () => {
    const out = await askQuestion(
      "What was revenue?",
      {},
      {
        retrieve: async () => [hit("a", 0.9, "noise")],
        scoreCe: async () => [0.1],
        getFact: () => fact("a"),
        getDocumentName: () => "x.pdf",
        getChunk: () => null,
      },
    );
    expect(out.refused).toBe(true);
    expect(out.stats.refusedAt).toBe("gate");
    expect(out.pack).toBeNull();
  });

  it("runs retrieve → rerank → generate happy path", async () => {
    const out = await askQuestion(
      "What was FY24 revenue?",
      {},
      {
        retrieve: async () => [
          hit("weak", 0.02, "Fleet grew"),
          hit("strong", 0.03, "Revenue from operations 8143 crore"),
        ],
        scoreCe: async () => [0.2, 0.92],
        getFact: (id) => (id === "f-strong" ? fact("strong") : fact("weak")),
        getDocumentName: () => "ar.pdf",
        getChunk: () => null,
        chatJson: async () =>
          JSON.stringify({
            refused: false,
            answer: "FY24 revenue was 8143 crore.",
            citationIndexes: [1],
            confidence: 0.9,
          }),
      },
    );

    expect(out.refused).toBe(false);
    expect(out.answer).toMatch(/8143/);
    expect(out.citations[0]?.factId).toBe("f-strong");
    expect(out.stats.retrieved).toBe(2);
    expect(out.stats.packed).toBeGreaterThan(0);
    expect(out.stats.refusedAt).toBeNull();
    expect(out.pack?.items[0]?.quote).toMatch(/8143/);
  });
});
