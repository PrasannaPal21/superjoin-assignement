import {
  getCeHigh,
  getCeLow,
  getRerankCeBlend,
  getRerankLlmMaxPerDoc,
  getRerankMinScore,
  getRerankTopM,
} from "@/lib/config";

export type CascadeBand = "accept" | "reject" | "mid";

export type CascadeScoredItem<T> = {
  item: T;
  ceScore: number;
  llmScore: number | null;
  finalScore: number;
  band: CascadeBand;
  usedLlm: boolean;
};

export function assignCeBand(
  ceScore: number,
  low = getCeLow(),
  high = getCeHigh(),
): CascadeBand {
  if (ceScore >= high) return "accept";
  if (ceScore <= low) return "reject";
  return "mid";
}

export function blendCeLlm(
  ceScore: number,
  llmScore: number,
  alpha = getRerankCeBlend(),
): number {
  const a = Math.min(1, Math.max(0, alpha));
  return a * ceScore + (1 - a) * llmScore;
}

/**
 * Apply cascade bands given CE scores (+ optional LLM scores for mid indexes).
 * LLM never rescues rejects; never overrides accepts.
 */
export function applyCascadeBands<T>(opts: {
  items: T[];
  ceScores: number[];
  /** Parallel to items; only mid-band entries are read. */
  llmScores?: Array<number | null | undefined>;
  low?: number;
  high?: number;
  alpha?: number;
  minScore?: number;
  topM?: number;
}): {
  kept: CascadeScoredItem<T>[];
  stats: {
    total: number;
    accepted: number;
    rejected: number;
    mid: number;
    llmUsed: number;
    kept: number;
  };
} {
  const low = opts.low ?? getCeLow();
  const high = opts.high ?? getCeHigh();
  const alpha = opts.alpha ?? getRerankCeBlend();
  const minScore = opts.minScore ?? getRerankMinScore();
  const topM = opts.topM ?? getRerankTopM();

  const scored: CascadeScoredItem<T>[] = [];
  let accepted = 0;
  let rejected = 0;
  let mid = 0;
  let llmUsed = 0;

  for (let i = 0; i < opts.items.length; i++) {
    const ceScore = opts.ceScores[i] ?? 0;
    const band = assignCeBand(ceScore, low, high);
    let finalScore = ceScore;
    let llmScore: number | null = null;
    let usedLlm = false;

    if (band === "accept") {
      accepted += 1;
      finalScore = ceScore;
    } else if (band === "reject") {
      rejected += 1;
      finalScore = ceScore;
    } else {
      mid += 1;
      const llm = opts.llmScores?.[i];
      if (typeof llm === "number") {
        llmScore = llm;
        usedLlm = true;
        llmUsed += 1;
        finalScore = blendCeLlm(ceScore, llm, alpha);
      } else {
        // Mid without LLM (budget exhausted / provider=ce): keep CE score.
        finalScore = ceScore;
      }
    }

    scored.push({
      item: opts.items[i],
      ceScore,
      llmScore,
      finalScore,
      band,
      usedLlm,
    });
  }

  const kept = scored
    .filter((s) => s.band !== "reject" && s.finalScore >= minScore)
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore || b.ceScore - a.ceScore,
    )
    .slice(0, topM);

  return {
    kept,
    stats: {
      total: opts.items.length,
      accepted,
      rejected,
      mid,
      llmUsed,
      kept: kept.length,
    },
  };
}

/** Pick mid-band indexes, capped by RERANK_LLM_MAX_PER_DOC. */
export function selectMidBandIndexes(
  ceScores: number[],
  opts?: { low?: number; high?: number; maxLlm?: number },
): number[] {
  const low = opts?.low ?? getCeLow();
  const high = opts?.high ?? getCeHigh();
  const maxLlm = opts?.maxLlm ?? getRerankLlmMaxPerDoc();
  const mid: number[] = [];
  for (let i = 0; i < ceScores.length; i++) {
    if (assignCeBand(ceScores[i] ?? 0, low, high) === "mid") mid.push(i);
  }
  // Prefer higher CE mid scores for scarce LLM budget (closer to accept).
  mid.sort((a, b) => (ceScores[b] ?? 0) - (ceScores[a] ?? 0));
  return mid.slice(0, maxLlm);
}
