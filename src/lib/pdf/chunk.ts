import { getChunkPages } from "@/lib/config";
import type { PdfPage } from "./types";

export type TextChunk = {
  pageStart: number;
  pageEnd: number;
  text: string;
  tokenEstimate: number;
};

function estimateTokens(text: string): number {
  // Rough heuristic: ~4 chars per token for English financial prose
  return Math.ceil(text.length / 4);
}

/**
 * Group pages into overlapping-safe contiguous chunks.
 * Skips pages that have no extractable text (logged by caller if needed).
 */
export function chunkPages(
  pages: PdfPage[],
  pagesPerChunk = getChunkPages(),
): TextChunk[] {
  const size = Math.max(1, pagesPerChunk);
  const usable = pages.filter((p) => p.text && p.text.length > 20);
  const chunks: TextChunk[] = [];

  for (let i = 0; i < usable.length; i += size) {
    const slice = usable.slice(i, i + size);
    if (slice.length === 0) continue;
    const text = slice
      .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
      .join("\n\n");
    // Cap extremely large chunks to keep LLM context sane
    const capped = text.length > 24_000 ? text.slice(0, 24_000) + "\n…[truncated]" : text;
    chunks.push({
      pageStart: slice[0].pageNumber,
      pageEnd: slice[slice.length - 1].pageNumber,
      text: capped,
      tokenEstimate: estimateTokens(capped),
    });
  }

  return chunks;
}
