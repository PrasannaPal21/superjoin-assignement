import { describe, expect, it } from "vitest";
import {
  amountsEquivalent,
  canonicalFactType,
  normalizePeriod,
  normalizeUnit,
  periodRelation,
  sameMetricFamily,
} from "@/lib/pipeline/fact-normalize";

describe("fact normalize (Compare)", () => {
  it("canonicalizes FY24 / FY 2024 / year-ended / quarters", () => {
    expect(normalizePeriod("FY24")).toBe("fy2024");
    expect(normalizePeriod("FY 2024")).toBe("fy2024");
    expect(normalizePeriod("Fiscal 2024")).toBe("fy2024");
    expect(normalizePeriod("Year ended March 31, 2024")).toBe("fy2024");
    expect(normalizePeriod("Q4 FY24")).toBe("q4fy2024");
    expect(normalizePeriod("Q3 FY 2023")).toBe("q3fy2023");
    expect(periodRelation("FY24", "FY 2024")).toBe("same");
    expect(periodRelation("Q4 FY24", "FY24")).toBe("nested");
    expect(periodRelation("FY24", "FY23")).toBe("parallel");
    expect(periodRelation("Q3 FY24", "FY23")).toBe("incompatible");
    expect(periodRelation("Q4 FY23", "FY24")).toBe("incompatible");
  });

  it("converts crore ↔ million and aliases revenue types", () => {
    expect(normalizeUnit("Cr")).toBe("crore");
    expect(normalizeUnit("million rupees")).toBe("million");
    expect(amountsEquivalent(81415.38, "million", 8142, "Cr").equal).toBe(true);
    expect(amountsEquivalent(81415.38, "million", 8142, null).equal).toBe(true);
    expect(amountsEquivalent(8143, "crore", 8143, "million").equal).toBe(false);
    expect(canonicalFactType("revenue_amount")).toBe("revenue");
    expect(canonicalFactType("revenue_from_contracts_with_customers")).toBe(
      "revenue",
    );
    expect(canonicalFactType("ebitda_value")).toBe("ebitda");
    expect(
      sameMetricFamily("revenue", "revenue_amount", null, null),
    ).toBe(true);
  });
});
