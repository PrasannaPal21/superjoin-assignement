/**
 * Canonical period / unit / metric helpers for Compare.
 * Makes FY24 ↔ FY2024, crore ↔ ₹ million, and revenue* aliases comparable.
 */

/** Map fiscal labels onto fyYYYY / qNfyYYYY when possible. */
export function normalizePeriod(period?: string | null): string {
  const raw = (period || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!raw) return "";

  // Year ended / as at / ending March 31, 2024 → fy2024 (Indian FY)
  const yearEnded = raw.match(
    /(?:year\s+ended|year\s+ending|as\s+at|as\s+on|ended)\s*(?:march\s*)?(\d{1,2}\s*,?\s*)?(\d{4})/i,
  );
  if (yearEnded?.[2]) {
    return `fy${yearEnded[2]}`;
  }

  // Q1 FY24 / Q4 FY 2023-24 / 4Q FY24
  const qFy = raw.match(
    /(?:q\s*([1-4])|([1-4])\s*q)\s*(?:fy\.?\s*)?(\d{2,4})(?:\s*[-–]\s*\d{2,4})?/i,
  );
  if (qFy) {
    const q = qFy[1] || qFy[2];
    const year = expandFiscalYear(qFy[3]);
    if (q && year) return `q${q}fy${year}`;
  }

  // FY24 / FY 2024 / Fiscal 2024 / FY2023-24
  const fy = raw.match(
    /(?:fy\.?|fiscal(?:\s*year)?)\s*['’]?\s*(\d{2,4})(?:\s*[-–/]\s*(\d{2,4}))?/i,
  );
  if (fy) {
    // Prefer the ending year when range given (FY2023-24 → 2024)
    const year = expandFiscalYear(fy[2] || fy[1]);
    if (year) return `fy${year}`;
  }

  // Bare 2023-24 / 2024
  const range = raw.match(/^(\d{4})\s*[-–/]\s*(\d{2,4})$/);
  if (range) {
    const year = expandFiscalYear(range[2].length === 2 ? range[2] : range[2]);
    if (year) return `fy${year}`;
  }

  return raw.replace(/[\s._]/g, "").replace(/fiscal|fy\.?/g, "fy");
}

function expandFiscalYear(token: string): string | null {
  const t = token.replace(/\D/g, "");
  if (t.length === 4) return t;
  if (t.length === 2) {
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    // 00–79 → 2000s; 80–99 → 1900s (finance decks are 2000s)
    return String(n >= 80 ? 1900 + n : 2000 + n);
  }
  return null;
}

export type PeriodRelation =
  | "same"
  | "nested"
  | "parallel"
  | "incompatible"
  | "unknown";

/**
 * same = identical fy/quarter
 * nested = quarter inside that *same* fiscal year (Q3 FY24 ⊂ FY24)
 * parallel = same grain, different period (FY23 vs FY24, or Q1 vs Q3)
 * incompatible = crossed grain/year (Q3 FY24 vs FY23, Q4 FY23 vs FY24)
 */
export function periodRelation(
  a?: string | null,
  b?: string | null,
): PeriodRelation {
  const na = normalizePeriod(a);
  const nb = normalizePeriod(b);
  if (!na || !nb) return "unknown";
  if (na === nb) return "same";

  const pa = parsePeriodParts(na);
  const pb = parsePeriodParts(nb);
  if (!pa || !pb) return "incompatible";

  const aIsQuarter = pa.quarter != null;
  const bIsQuarter = pb.quarter != null;

  // Quarter vs full year of the *same* FY → nested adaptive scale
  if (aIsQuarter !== bIsQuarter) {
    if (pa.year === pb.year) return "nested";
    return "incompatible";
  }

  // Same grain (both FY or both quarters)
  if (pa.year !== pb.year || pa.quarter !== pb.quarter) return "parallel";
  return "same";
}

/** @deprecated alias — prefer periodRelation; maps parallel→different for old callers */
export function periodRelationLegacy(
  a?: string | null,
  b?: string | null,
): "same" | "nested" | "different" | "unknown" {
  const r = periodRelation(a, b);
  if (r === "parallel" || r === "incompatible") return "different";
  return r;
}

/**
 * Absolute INR-crore magnitudes within `maxRatio` (default 3×).
 * Used to avoid false Conflicts between different line items.
 */
export function magnitudesComparable(
  aValue: number,
  aUnit: string | null | undefined,
  bValue: number,
  bUnit: string | null | undefined,
  maxRatio = 3,
): boolean {
  const eq = amountsEquivalent(aValue, aUnit, bValue, bUnit);
  if (eq.equal) return true;

  const candidates = (v: number, u: string | null | undefined): number[] => {
    const c = toInrCrore(v, u);
    if (c != null) return [Math.abs(c)];
    // unknown unit: try raw + crore/million interpretations
    return [Math.abs(v), Math.abs(v) / 10, Math.abs(v) * 10].filter((n) =>
      Number.isFinite(n),
    );
  };

  const as = candidates(aValue, aUnit);
  const bs = candidates(bValue, bUnit);
  for (const x of as) {
    for (const y of bs) {
      const hi = Math.max(x, y);
      const lo = Math.max(Math.min(x, y), 1e-9);
      if (hi / lo <= maxRatio) return true;
    }
  }
  return false;
}

function parsePeriodParts(
  norm: string,
): { year: string; quarter: number | null } | null {
  const q = norm.match(/^q([1-4])fy(\d{4})$/);
  if (q) return { year: q[2], quarter: Number(q[1]) };
  const y = norm.match(/^fy(\d{4})$/);
  if (y) return { year: y[1], quarter: null };
  return null;
}

export function normalizeUnit(unit?: string | null): string {
  const u = (unit || "").toLowerCase().replace(/\s+/g, "");
  if (!u) return "";
  if (
    /^cr(ore)?s?$/.test(u) ||
    u === "₹crore" ||
    u.includes("crore") ||
    u === "cr"
  ) {
    return "crore";
  }
  if (
    /^(mn|m|million)s?$/.test(u) ||
    u.includes("million") ||
    u.includes("mninr") ||
    u.includes("inrmillion")
  ) {
    return "million";
  }
  if (/^(bn|b|billion)s?$/.test(u) || u.includes("billion")) return "billion";
  if (/^lakh?s?$/.test(u) || u.includes("lakh")) return "lakh";
  if (/^(%|pct|percent|percentage)$/.test(u)) return "percent";
  // Indian filings often mislabel ₹ tables as USD/GBP — treat as unknown scale
  if (u === "usd" || u === "gbp" || u === "inr" || u === "rs" || u === "₹") {
    return "";
  }
  return u;
}

/** Convert a numeric amount into ₹ crore when the unit is a known INR scale. */
export function toInrCrore(
  value: number,
  unit?: string | null,
): number | null {
  if (!Number.isFinite(value)) return null;
  const u = normalizeUnit(unit);
  if (u === "crore") return value;
  if (u === "million") return value / 10;
  if (u === "billion") return value * 100;
  if (u === "lakh") return value / 100;
  if (u === "percent") return null;
  return null;
}

/**
 * Compare two amounts with adaptive unit scale (crore ↔ million, etc.).
 * When one side has no unit, try plausible INR scales against the other.
 */
export function amountsEquivalent(
  aValue: number,
  aUnit: string | null | undefined,
  bValue: number,
  bUnit: string | null | undefined,
  relTol = 0.03,
): { equal: boolean; scale: "exact" | "converted" | "inferred" | null } {
  const approx = (x: number, y: number) => {
    const denom = Math.max(Math.abs(x), Math.abs(y), 1);
    return Math.abs(x - y) / denom <= relTol;
  };

  const au = normalizeUnit(aUnit);
  const bu = normalizeUnit(bUnit);

  if (au && bu && au === bu) {
    return { equal: approx(aValue, bValue), scale: "exact" };
  }

  const ac = toInrCrore(aValue, aUnit);
  const bc = toInrCrore(bValue, bUnit);
  if (ac != null && bc != null) {
    // Sign-insensitive: "loss of 1008" vs PAT -1008
    if (approx(ac, bc) || approx(Math.abs(ac), Math.abs(bc))) {
      return { equal: true, scale: "converted" };
    }
    return { equal: false, scale: null };
  }

  // Infer: one side missing/unknown unit — test crore and million interpretations
  const aCandidates =
    ac != null
      ? [ac, Math.abs(ac)]
      : [aValue, aValue / 10, aValue * 10, Math.abs(aValue)].filter((n) =>
          Number.isFinite(n),
        );
  const bCandidates =
    bc != null
      ? [bc, Math.abs(bc)]
      : [bValue, bValue / 10, bValue * 10, Math.abs(bValue)].filter((n) =>
          Number.isFinite(n),
        );

  for (const x of aCandidates) {
    for (const y of bCandidates) {
      if (approx(x, y)) return { equal: true, scale: "inferred" };
    }
  }
  return { equal: false, scale: null };
}

const GENERIC_ENTITIES = new Set([
  "company",
  "financial",
  "finance",
  "total",
  "overall",
  "unknown",
  "india",
  "consolidated",
  "standalone",
  "restated",
  "services",
  "group",
  "entity",
  "na",
  "n a",
  "the",
  "a",
  "an",
  "and",
  "balance sheet",
  "profit and loss",
]);

/**
 * Entity strings that are placeholders, not real company names.
 * Empty → skip entity mismatch checks / omit from match keys.
 */
export function normalizeEntityForMatch(entity?: string | null): string {
  const n = (entity || "")
    .toLowerCase()
    .replace(/\b(limited|ltd\.?|inc\.?|pvt\.?|private|company)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return "";
  if (GENERIC_ENTITIES.has(n) || n.length < 3) return "";
  const first = n.split(" ")[0] || "";
  if (GENERIC_ENTITIES.has(first) && n.split(" ").length <= 2) return "";
  // "services (A)" / row labels — not entities
  if (/^(services|express|part|segment|particulars)\b/.test(n)) return "";
  return n;
}

/** Types too vague to Compare without stronger claim overlap. */
const VAGUE_FACT_TYPES = new Set([
  "financial_metric",
  "percentage",
  "other",
  "metric",
  "amount",
  "value",
]);

/** Collapse extract-time fact_type drift into a Compare family. */
export function canonicalFactType(factType?: string | null): string {
  const t = (factType || "").toLowerCase().trim();
  if (!t || t === "other") return t || "other";

  if (/growth_rate|revenue_growth/.test(t) || t === "growth") {
    return "growth_rate";
  }
  // total_income is NOT revenue — keep separate
  if (/^total_income$/.test(t)) return "total_income";
  if (
    /^(revenue|revenue_amount|revenue_from_contracts|revenue_from_contracts_with_customers|income_from_operations|operating_revenue)$/.test(
      t,
    ) ||
    (t.includes("revenue") && !/growth|margin|rate|mix/.test(t))
  ) {
    return "revenue";
  }
  if (/ebitda/.test(t) && !/margin|growth/.test(t)) return "ebitda";
  if (
    /^(pat|pat_value|profit_loss|net_profit|profit_after_tax|loss)$/.test(t) ||
    (/pat/.test(t) && !/margin|growth|reduction/.test(t))
  ) {
    return "pat";
  }
  return t;
}

function claimOverlapScore(a?: string | null, b?: string | null): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );
  const ta = tokens(a || "");
  const tb = tokens(b || "");
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.min(ta.size, tb.size);
}

export function sameMetricFamily(
  aType?: string | null,
  bType?: string | null,
  aKey?: string | null,
  bKey?: string | null,
  aClaim?: string | null,
  bClaim?: string | null,
): boolean {
  if (aKey && bKey && aKey === bKey) return true;
  const ca = canonicalFactType(aType);
  const cb = canonicalFactType(bType);
  if (!ca || !cb || ca === "other" || cb === "other") return false;
  if (ca !== cb) return false;
  // Vague catch-alls need claim overlap (avoid FX vs random "financial_metric")
  if (VAGUE_FACT_TYPES.has(ca)) {
    return claimOverlapScore(aClaim, bClaim) >= 0.35;
  }
  return true;
}
