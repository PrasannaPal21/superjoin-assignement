import { describe, expect, it } from "vitest";
import {
  applyMetadataSoftBoosts,
  entitiesSameFamily,
  metadataSoftBoost,
  normalizeEntityFamily,
  normalizePeriod,
} from "@/lib/embeddings/metadata-filters";
import type { FactRow } from "@/lib/db/facts";

function fact(
  partial: Partial<FactRow> & Pick<FactRow, "id">,
): FactRow {
  return {
    document_id: "d",
    chunk_id: null,
    claim: "x",
    raw_value: null,
    numeric_value: null,
    unit: null,
    period: null,
    scope: null,
    entity: null,
    fact_type: "other",
    confidence: 0.9,
    status: "active",
    match_key: null,
    created_at: "",
    ...partial,
  };
}

describe("metadata soft filters (embeddings step 8)", () => {
  it("normalizes entity family and period", () => {
    expect(normalizeEntityFamily("Delhivery Limited")).toBe("delhivery");
    expect(entitiesSameFamily("Delhivery Ltd", "Delhivery Limited")).toBe(
      true,
    );
    expect(entitiesSameFamily("Delhivery", "Acme Corp")).toBe(false);
    expect(normalizePeriod("FY 2024")).toBe("fy2024");
    expect(normalizePeriod("Fiscal 2024")).toBe("fy2024");
  });

  it("boosts same entity/unit/type/period without dropping period mismatches", () => {
    const query = fact({
      id: "q",
      entity: "Delhivery Limited",
      unit: "crore",
      fact_type: "revenue",
      period: "FY24",
    });
    const same = fact({
      id: "a",
      entity: "Delhivery",
      unit: "crore",
      fact_type: "revenue",
      period: "FY24",
    });
    const otherPeriod = fact({
      id: "b",
      entity: "Delhivery",
      unit: "crore",
      fact_type: "revenue",
      period: "FY23",
    });
    const otherEntity = fact({
      id: "c",
      entity: "Acme Logistics",
      unit: "crore",
      fact_type: "revenue",
      period: "FY24",
    });

    const sameBoost = metadataSoftBoost(query, same);
    expect(sameBoost.tags).toEqual(
      expect.arrayContaining(["entity", "unit", "type", "period"]),
    );
    expect(sameBoost.multiplier).toBeGreaterThan(1.3);

    const periodMismatch = metadataSoftBoost(query, otherPeriod);
    expect(periodMismatch.tags).toContain("entity");
    expect(periodMismatch.tags).not.toContain("period");
    expect(periodMismatch.multiplier).toBeGreaterThan(1);

    const ranked = applyMetadataSoftBoosts(
      query,
      [
        { factId: "a", score: 0.02 },
        { factId: "b", score: 0.02 },
        { factId: "c", score: 0.02 },
      ],
      new Map([
        ["a", same],
        ["b", otherPeriod],
        ["c", otherEntity],
      ]),
    );

    expect(ranked.map((h) => h.factId)).toEqual(["a", "b", "c"]);
    expect(ranked.every((h) => ["a", "b", "c"].includes(h.factId))).toBe(true);
    expect(ranked.find((h) => h.factId === "b")).toBeTruthy();
  });
});
