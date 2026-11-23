import { describe, expect, it } from "vitest";
import type { FactRow } from "@/lib/db/facts";
import {
  ENTITY_MISMATCH_RERANK_KEEP,
  classifyRelationHeuristic,
  clampConfidence,
  normalizeClassificationResult,
  normalizeScope,
  normalizeUnit,
  parseClassifyBatchResponse,
} from "@/lib/pipeline/classify-relation";

function fact(partial: Partial<FactRow> & Pick<FactRow, "id">): FactRow {
  return {
    document_id: "d",
    chunk_id: null,
    claim: "claim",
    raw_value: null,
    numeric_value: null,
    unit: null,
    period: null,
    scope: null,
    entity: "Delhivery",
    fact_type: "revenue",
    confidence: 0.9,
    status: "active",
    match_key: "delhivery|revenue|crore",
    created_at: "",
    ...partial,
  };
}

describe("classify heuristics (stage 1)", () => {
  it("normalizes units and scopes", () => {
    expect(normalizeUnit("Crores")).toBe("crore");
    expect(normalizeUnit("mn")).toBe("million");
    expect(normalizeUnit("%")).toBe("percent");
    expect(normalizeScope("Consolidated")).toBe("consolidated");
    expect(normalizeScope("stand-alone")).toBe("standalone");
  });

  it("corroborates matching numbers in the same family", () => {
    const a = fact({
      id: "a",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
      match_key: "delhivery|revenue|crore",
    });
    const b = fact({
      id: "b",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
      match_key: "delhivery|revenue|crore",
    });
    const r = classifyRelationHeuristic(a, b);
    expect(r?.relationType).toBe("corroborates");
    expect(r?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("reconciles equal numbers with different units", () => {
    const a = fact({
      id: "a",
      numeric_value: 100,
      unit: "crore",
      period: "FY24",
    });
    const b = fact({
      id: "b",
      numeric_value: 100,
      unit: "million",
      period: "FY24",
    });
    const r = classifyRelationHeuristic(a, b);
    expect(r?.relationType).toBe("reconciled");
    expect(r?.contextTags).toContain("units");
  });

  it("reconciles equal numbers with different scope", () => {
    const a = fact({
      id: "a",
      numeric_value: 500,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    });
    const b = fact({
      id: "b",
      numeric_value: 500,
      unit: "crore",
      period: "FY24",
      scope: "standalone",
    });
    const r = classifyRelationHeuristic(a, b);
    expect(r?.relationType).toBe("reconciled");
    expect(r?.contextTags).toContain("scope");
  });

  it("reconciles different values across periods", () => {
    const a = fact({
      id: "a",
      numeric_value: 8000,
      unit: "crore",
      period: "FY24",
    });
    const b = fact({
      id: "b",
      numeric_value: 7000,
      unit: "crore",
      period: "FY23",
    });
    const r = classifyRelationHeuristic(a, b);
    expect(r?.relationType).toBe("reconciled");
    expect(r?.contextTags).toContain("time");
  });

  it("flags conflicts when period/unit/scope align", () => {
    const a = fact({
      id: "a",
      numeric_value: 8000,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    });
    const b = fact({
      id: "b",
      numeric_value: 7000,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    });
    const r = classifyRelationHeuristic(a, b);
    expect(r?.relationType).toBe("contradicts");
  });

  it("marks different entity families unrelated unless rerank is strong", () => {
    const a = fact({
      id: "a",
      entity: "Delhivery",
      numeric_value: 100,
      unit: "crore",
      period: "FY24",
    });
    const b = fact({
      id: "b",
      entity: "Acme Logistics",
      numeric_value: 100,
      unit: "crore",
      period: "FY24",
      match_key: "acme|revenue|crore",
    });
    expect(classifyRelationHeuristic(a, b)?.relationType).toBe("unrelated");
    expect(
      classifyRelationHeuristic(a, b, {
        rerankScore: ENTITY_MISMATCH_RERANK_KEEP,
      }),
    ).toBeNull();
  });

  it("marks different fact types unrelated when rerank is weak", () => {
    const a = fact({
      id: "a",
      fact_type: "revenue",
      match_key: "delhivery|revenue|crore",
      numeric_value: 100,
    });
    const b = fact({
      id: "b",
      fact_type: "fleet",
      match_key: "delhivery|fleet|vehicles",
      claim: "Fleet size",
      unit: "vehicles",
      numeric_value: 12000,
    });
    expect(classifyRelationHeuristic(a, b, { rerankScore: 0.2 })?.relationType).toBe(
      "unrelated",
    );
    expect(
      classifyRelationHeuristic(a, b, { rerankScore: 0.7 }),
    ).toBeNull();
  });

  it("uses raw_value equality when numerics are missing", () => {
    const a = fact({
      id: "a",
      raw_value: "8143",
      numeric_value: null,
      period: "FY24",
    });
    const b = fact({
      id: "b",
      raw_value: "8143",
      numeric_value: null,
      period: "FY24",
    });
    expect(classifyRelationHeuristic(a, b)?.relationType).toBe("corroborates");
  });
});

describe("classify LLM parse hardening (stage 2)", () => {
  it("clamps confidence into [0,1]", () => {
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(-0.2)).toBe(0);
    expect(clampConfidence("0.7")).toBeCloseTo(0.7, 5);
    expect(clampConfidence("nope")).toBe(0.5);
  });

  it("normalizes a single classification payload", () => {
    const ok = normalizeClassificationResult({
      relationType: "reconciled",
      rationale: "Different FY",
      contextTags: ["time"],
      confidence: 1.2,
    });
    expect(ok?.relationType).toBe("reconciled");
    expect(ok?.confidence).toBe(1);
    expect(
      normalizeClassificationResult({ relationType: "nope", confidence: 0.5 }),
    ).toBeNull();
  });

  it("parses batch responses without throwing on missing indexes", () => {
    const raw = JSON.stringify({
      results: [
        {
          index: 0,
          relationType: "corroborates",
          rationale: "same",
          contextTags: [],
          confidence: 0.9,
        },
        {
          index: 2,
          relationType: "contradicts",
          rationale: "conflict",
          contextTags: [],
          confidence: 0.8,
        },
        { index: 99, relationType: "unrelated", rationale: "x", confidence: 0.5 },
      ],
    });
    const out = parseClassifyBatchResponse(raw, 3);
    expect(out).toHaveLength(3);
    expect(out[0]?.relationType).toBe("corroborates");
    expect(out[1]).toBeNull();
    expect(out[2]?.relationType).toBe("contradicts");
  });

  it("returns all-null on garbage JSON instead of throwing", () => {
    expect(parseClassifyBatchResponse("not json {{{", 2)).toEqual([null, null]);
  });
});
