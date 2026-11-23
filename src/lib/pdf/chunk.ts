import {
  getChunkCharBudget,
  getChunkPages,
  getMaxExtractChunks,
} from "@/lib/config";
import { scorePageSignal, selectHighSignalPages } from "@/lib/pdf/signal";
import type { PdfPage } from "./types";

/** Parent = section/table context; child = extract unit; flat = legacy page-pack (step 1). */
export type ChunkKind = "parent" | "child" | "flat";

export type TextChunk = {
  pageStart: number;
  pageEnd: number;
  text: string;
  tokenEstimate: number;
  signalScore: number;
  /** Hierarchy role — packing today emits `flat` until structure steps land. */
  kind: ChunkKind;
  /** Set on children once parents exist (steps 4–5). */
  parentId?: string | null;
  /** Section / table title when known (steps 2+). */
  sectionTitle?: string | null;
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function pageSignal(page: PdfPage): number {
  return page.signalScore ?? scorePageSignal(page.text || "");
}

function buildChunk(slice: PdfPage[]): TextChunk {
  const text = slice.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
  const capped =
    text.length > getChunkCharBudget() + 2000
      ? text.slice(0, getChunkCharBudget() + 2000) + "\n…[truncated]"
      : text;
  const signalScore = slice.reduce((s, p) => s + pageSignal(p), 0);
  return {
    pageStart: slice[0].pageNumber,
    pageEnd: slice[slice.length - 1].pageNumber,
    text: capped,
    tokenEstimate: estimateTokens(capped),
    signalScore,
    // Step 1: current packer stays behavior-identical; mark as flat extract units.
    kind: "flat",
    parentId: null,
    sectionTitle: null,
  };
}

/**
 * Pack high-signal pages into fewer, larger chunks.
 * Signal scoring is the budget prior; structure-aware parent/child comes later.
 * Caps total LLM extract calls via MAX_EXTRACT_CHUNKS.
 */
export function chunkPages(
  pages: PdfPage[],
  pagesPerChunk = getChunkPages(),
): TextChunk[] {
  const charBudget = getChunkCharBudget();
  const maxPages = Math.max(1, pagesPerChunk);
  const maxChunks = getMaxExtractChunks();

  // Prefer pages already scored after parse; selectHighSignalPages fills gaps.
  const selected = selectHighSignalPages(pages, {
    limit: maxChunks * maxPages,
  });

  const packed: TextChunk[] = [];
  let buf: PdfPage[] = [];
  let bufChars = 0;

  const flush = () => {
    if (buf.length === 0) return;
    packed.push(buildChunk(buf));
    buf = [];
    bufChars = 0;
  };

  for (const page of selected) {
    const len = page.text.length + 24;
    if (
      buf.length > 0 &&
      (buf.length >= maxPages || bufChars + len > charBudget)
    ) {
      flush();
    }
    buf.push(page);
    bufChars += len;
  }
  flush();

  // Prefer denser chunks if we still exceed the call budget
  if (packed.length <= maxChunks) return packed;
  return packed
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, maxChunks)
    .sort((a, b) => a.pageStart - b.pageStart);
}

/** Re-export for callers/tests that historically imported from chunk. */
export { scorePageSignal } from "@/lib/pdf/signal";
