import { getOcrMinTextChars, getSignalMinScore } from "@/lib/config";
import type { PdfPage } from "./types";

/**
 * Finance / KPI hits that suggest a page is worth LLM extract budget.
 * Intentionally broad — this is a prior for ranking, not a taxonomy.
 */
const SIGNAL_RE =
  /(\d[\d,]*(?:\.\d+)?)|₹|rs\.?|inr|usd|crore|lakh|million|billion|%|bps|revenue|turnover|income|profit|loss|pat|ebitda|ebit|eps|fiscal|fy\s?\d{2,4}|q[1-4]\s*fy|assets|equity|liabilit|margin|growth|yoy|qoq|consolidated|standalone|director|board|tonnage|shipment|pin\s*code|capacity|utili[sz]ation|operating|cash\s*flow|net\s*worth|order\s*book/gi;

/** Boilerplate / navigation pages — keep only if they still have strong KPI hits. */
const LOW_SIGNAL_RE =
  /table of contents|contents\s+page|this page (is|has been) intentionally|glossary of terms|list of abbreviations|forward[\s-]?looking statements|safe harbor|index of|corporate information\s*$|\.{4,}/i;

export type PageSignalBreakdown = {
  score: number;
  hits: number;
  density: number;
  numberBonus: number;
  lowSignal: boolean;
};

/**
 * Score how likely a page holds extractable finance facts.
 * Used as a **budget prior** before chunking — not for cutting mid-section later.
 */
export function scorePageSignal(text: string): number {
  return explainPageSignal(text).score;
}

export function explainPageSignal(text: string): PageSignalBreakdown {
  const lowSignalEarly = Boolean(text && LOW_SIGNAL_RE.test(text));
  if (!text || text.length < getOcrMinTextChars()) {
    return {
      score: 0,
      hits: 0,
      density: 0,
      numberBonus: 0,
      lowSignal: lowSignalEarly,
    };
  }

  const hits = text.match(SIGNAL_RE) || [];
  const lowSignal = lowSignalEarly;

  if (lowSignal && hits.length < 3) {
    return {
      score: 0.1,
      hits: hits.length,
      density: 0,
      numberBonus: 0,
      lowSignal: true,
    };
  }

  const density = hits.length / Math.max(1, text.length / 400);
  const digitCount = (text.match(/\d/g) || []).length;
  const numberBonus = digitCount > 8 ? 1.5 : digitCount > 3 ? 0.5 : 0;
  // Light bonus when many currency/metric tokens appear (typical KPI tables).
  const financeBonus = hits.length >= 12 ? 1.0 : hits.length >= 6 ? 0.5 : 0;
  const score = Math.min(20, density + numberBonus + financeBonus);

  return {
    score,
    hits: hits.length,
    density,
    numberBonus,
    lowSignal,
  };
}

/**
 * Attach `signalScore` to every page (mutates in place and returns same array).
 * Call after parse + OCR so chunking can reuse scores without recomputing.
 */
export function applyPageSignals(pages: PdfPage[]): PdfPage[] {
  for (const page of pages) {
    page.signalScore = scorePageSignal(page.text || "");
  }
  return pages;
}

/**
 * Rank pages for extract budget: drop fluff, keep high-signal pages in reading order
 * after selecting the top-N by score.
 */
export function selectHighSignalPages(
  pages: PdfPage[],
  options?: { minScore?: number; limit?: number },
): PdfPage[] {
  const minScore = options?.minScore ?? getSignalMinScore();
  const minChars = getOcrMinTextChars();

  const scored = pages
    .map((p) => ({
      page: p,
      score: p.signalScore ?? scorePageSignal(p.text || ""),
    }))
    .filter(({ page, score }) => (page.text?.length ?? 0) > minChars && score >= minScore)
    .sort((a, b) => b.score - a.score || a.page.pageNumber - b.page.pageNumber);

  const limited =
    options?.limit != null && options.limit > 0
      ? scored.slice(0, options.limit)
      : scored;

  return limited
    .map(({ page, score }) => {
      page.signalScore = score;
      return page;
    })
    .sort((a, b) => a.pageNumber - b.pageNumber);
}
