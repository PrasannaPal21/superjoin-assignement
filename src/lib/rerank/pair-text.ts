import {
  buildEvidenceIndexText,
  buildFactCard,
} from "@/lib/embeddings/index-text";
import type { FactRow } from "@/lib/db/facts";

/** Stable CE / LLM pair strings from fact cards. */
export function factPairTexts(left: FactRow, right: FactRow): {
  query: string;
  doc: string;
} {
  return {
    query: buildFactCard(left),
    doc: buildFactCard(right),
  };
}

/** Ask CE pair: user question ↔ evidence quote (A2). */
export function askEvidencePairTexts(
  question: string,
  evidence: { page?: number | null; quote: string },
): { query: string; doc: string } {
  const q = (question ?? "").replace(/\s+/g, " ").trim();
  return {
    query: q,
    doc: buildEvidenceIndexText({
      page: evidence.page ?? null,
      quote: evidence.quote,
    }),
  };
}
