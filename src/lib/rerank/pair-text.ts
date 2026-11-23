import { buildFactCard } from "@/lib/embeddings/index-text";
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
