import {
  getChunkCharBudget,
  getChunkPages,
  getMaxExtractChunks,
} from "@/lib/config";
import type { PdfPage } from "./types";

export type TextChunk = {
  pageStart: number;
  pageEnd: number;
  text: string;
  tokenEstimate: number;
  signalScore: number;
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const SIGNAL_RE =
  /(\d[\d,]*(?:\.\d+)?)|₹|rs\.?|crore|million|billion|%|revenue|profit|ebitda|fiscal|fy\d|assets|equity|liabilit|director|board|tonnage|shipment|pin\s*code|capacity|utili[sz]ation/gi;

const LOW_SIGNAL_RE =
  /table of contents|contents\s+page|this page (is|has been) intentionally|glossary of terms|\.{4,}/i;

/**
 * Score how likely a page holds extractable facts.
 * Skips TOC / filler so we spend LLM budget on dense pages.
 */
export function scorePageSignal(text: string): number {
  if (!text || text.length < 40) return 0;
  if (LOW_SIGNAL_RE.test(text) && (text.match(SIGNAL_RE) || []).length < 3) {
    return 0.1;
  }
  const hits = text.match(SIGNAL_RE) || [];
  const density = hits.length / Math.max(1, text.length / 400);
  const numberBonus = (text.match(/\d/g) || []).length > 8 ? 1.5 : 0;
  return Math.min(20, density + numberBonus);
}

function buildChunk(slice: PdfPage[]): TextChunk {
  const text = slice.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
  const capped =
    text.length > getChunkCharBudget() + 2000
      ? text.slice(0, getChunkCharBudget() + 2000) + "\n…[truncated]"
      : text;
  const signalScore = slice.reduce((s, p) => s + scorePageSignal(p.text), 0);
  return {
    pageStart: slice[0].pageNumber,
    pageEnd: slice[slice.length - 1].pageNumber,
    text: capped,
    tokenEstimate: estimateTokens(capped),
    signalScore,
  };
}

/**
 * Pack high-signal pages into fewer, larger chunks.
 * Caps total LLM extract calls via MAX_EXTRACT_CHUNKS.
 */
export function chunkPages(
  pages: PdfPage[],
  pagesPerChunk = getChunkPages(),
): TextChunk[] {
  const charBudget = getChunkCharBudget();
  const maxPages = Math.max(1, pagesPerChunk);
  const maxChunks = getMaxExtractChunks();

  const usable = pages
    .filter((p) => p.text && p.text.length > 40 && scorePageSignal(p.text) >= 0.8)
    .sort((a, b) => scorePageSignal(b.text) - scorePageSignal(a.text));

  // Keep reading order for packing after selecting top pages by signal
  const selected = usable
    .slice(0, Math.min(usable.length, maxChunks * maxPages))
    .sort((a, b) => a.pageNumber - b.pageNumber);

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
