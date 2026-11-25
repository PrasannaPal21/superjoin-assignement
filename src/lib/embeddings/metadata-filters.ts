import {
  getEntityFamilyBoost,
  getFactTypeBoost,
  getPeriodMatchBoost,
  getUnitMatchBoost,
} from "@/lib/config";
import type { FactRow } from "@/lib/db/facts";
import {
  canonicalFactType,
  normalizePeriod,
  normalizeUnit,
} from "@/lib/pipeline/fact-normalize";

export { normalizePeriod } from "@/lib/pipeline/fact-normalize";

/**
 * Soft metadata scoring for hybrid recall.
 * Prefer same entity family / unit / type / period — never hard-drop
 * different periods (needed for `reconciled`).
 */

export function normalizeEntityFamily(entity?: string | null): string {
  return (entity || "")
    .toLowerCase()
    .replace(/\b(limited|ltd\.?|inc\.?|pvt\.?|private|company)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when entity strings look like the same company family. */
export function entitiesSameFamily(
  a?: string | null,
  b?: string | null,
): boolean {
  const na = normalizeEntityFamily(a);
  const nb = normalizeEntityFamily(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(" ")[0] || "";
  const tb = nb.split(" ")[0] || "";
  if (ta.length < 3 || tb.length < 3) return false;
  return na.includes(tb) || nb.includes(ta);
}

export type MetadataBoost = {
  /** Multiply RRF score by this (≥ 1). */
  multiplier: number;
  tags: string[];
};

/**
 * Soft boosts only. Different period → no penalty (reconciled path).
 */
export function metadataSoftBoost(
  query: Pick<FactRow, "entity" | "unit" | "fact_type" | "period">,
  candidate: Pick<FactRow, "entity" | "unit" | "fact_type" | "period">,
): MetadataBoost {
  let multiplier = 1;
  const tags: string[] = [];

  if (entitiesSameFamily(query.entity, candidate.entity)) {
    multiplier *= getEntityFamilyBoost();
    tags.push("entity");
  }

  const qu = normalizeUnit(query.unit);
  const cu = normalizeUnit(candidate.unit);
  if (qu && cu && qu === cu) {
    multiplier *= getUnitMatchBoost();
    tags.push("unit");
  } else if (
    qu &&
    cu &&
    ["crore", "million", "billion", "lakh"].includes(qu) &&
    ["crore", "million", "billion", "lakh"].includes(cu)
  ) {
    // Compatible INR scales — still help recall for million↔crore pairs
    multiplier *= Math.sqrt(getUnitMatchBoost());
    tags.push("unit_scale");
  }

  const qt = canonicalFactType(query.fact_type);
  const ct = canonicalFactType(candidate.fact_type);
  if (qt && ct && qt === ct && qt !== "other") {
    multiplier *= getFactTypeBoost();
    tags.push("type");
  }

  const qp = normalizePeriod(query.period);
  const cp = normalizePeriod(candidate.period);
  if (qp && cp && qp === cp) {
    multiplier *= getPeriodMatchBoost();
    tags.push("period");
  }

  return { multiplier, tags };
}

/**
 * Apply soft metadata multipliers and re-rank. Does not drop period mismatches.
 */
export function applyMetadataSoftBoosts<T extends { factId: string; score: number }>(
  query: Pick<FactRow, "entity" | "unit" | "fact_type" | "period">,
  hits: T[],
  candidatesById: Map<string, FactRow>,
): Array<T & { boosts: string[] }> {
  return hits
    .map((hit) => {
      const cand = candidatesById.get(hit.factId);
      if (!cand) return { ...hit, boosts: [] as string[], score: hit.score };
      const boost = metadataSoftBoost(query, cand);
      return {
        ...hit,
        score: hit.score * boost.multiplier,
        boosts: boost.tags,
      };
    })
    .sort((a, b) => b.score - a.score || a.factId.localeCompare(b.factId));
}
