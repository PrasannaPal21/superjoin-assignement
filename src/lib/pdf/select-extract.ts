import { getMaxExtractChunks } from "@/lib/config";
import type { TextChunk } from "@/lib/pdf/chunk";

export type ExtractJob = {
  child: TextChunk;
  childId: string;
  parent: TextChunk;
};

function extractPriority(child: TextChunk): number {
  const signal = child.signalScore ?? 0;
  const tableBoost = child.blockKind === "table" ? 0.75 : 0;
  return signal + tableBoost;
}

/**
 * Cap LLM extract calls: keep the highest-signal children (tables slightly boosted).
 */
export function selectExtractChildren(
  jobs: ExtractJob[],
  limit = getMaxExtractChunks(),
): ExtractJob[] {
  const cap = Math.max(1, limit);
  return [...jobs]
    .sort(
      (a, b) =>
        extractPriority(b.child) - extractPriority(a.child) ||
        a.child.pageStart - b.child.pageStart,
    )
    .slice(0, cap);
}
