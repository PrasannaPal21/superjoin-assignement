/**
 * Canonical texts for dense/sparse indexing (embeddings step 1).
 * No embedding API calls here — pure string builders only.
 */

export type FactCardInput = {
  entity?: string | null;
  factType?: string | null;
  fact_type?: string | null;
  claim?: string | null;
  rawValue?: string | null;
  raw_value?: string | null;
  numericValue?: number | null;
  numeric_value?: number | null;
  unit?: string | null;
  period?: string | null;
  scope?: string | null;
};

export type EvidenceIndexInput = {
  page?: number | null;
  quote: string;
};

function cleanPart(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function factTypeOf(fact: FactCardInput): string {
  return cleanPart(fact.factType ?? fact.fact_type);
}

function rawValueOf(fact: FactCardInput): string {
  const raw = cleanPart(fact.rawValue ?? fact.raw_value);
  if (raw) return raw;
  const num = fact.numericValue ?? fact.numeric_value;
  if (num == null || Number.isNaN(num)) return "";
  return String(num);
}

/**
 * Fact card for Compare / dense+sparse fact indexing.
 * Format: entity | fact_type | claim | raw_value | unit | period | scope
 *
 * Empty fields are kept as blank slots so position stays stable for the embedder.
 */
export function buildFactCard(fact: FactCardInput): string {
  const parts = [
    cleanPart(fact.entity),
    factTypeOf(fact),
    cleanPart(fact.claim),
    rawValueOf(fact),
    cleanPart(fact.unit),
    cleanPart(fact.period),
    cleanPart(fact.scope),
  ];
  return parts.join(" | ").replace(/\s+\|\s+$/g, "").trim();
}

/**
 * Compact fact card that drops empty trailing slots (nicer for BM25).
 * Dense embed can use either; default indexing uses `buildFactCard`.
 */
export function buildFactCardCompact(fact: FactCardInput): string {
  const parts = [
    cleanPart(fact.entity),
    factTypeOf(fact),
    cleanPart(fact.claim),
    rawValueOf(fact),
    cleanPart(fact.unit),
    cleanPart(fact.period),
    cleanPart(fact.scope),
  ].filter(Boolean);
  return parts.join(" | ");
}

/**
 * Evidence text for Ask / evidence dense indexing.
 * Format: page={n} | {quote}
 */
export function buildEvidenceIndexText(evidence: EvidenceIndexInput): string {
  const quote = cleanPart(evidence.quote);
  const page =
    evidence.page != null && Number.isFinite(evidence.page)
      ? `page=${evidence.page}`
      : "page=?";
  return `${page} | ${quote}`.trim();
}

/** Tokens useful for sparse/BM25 over a fact card (lowercase, length > 2). */
export function tokenizeIndexText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\s|]/g, " ")
    .split(/[\s|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}
