import {
  getRerankProvider,
  getRerankTopM,
  getRerankMinScore,
} from "@/lib/config";
import type { FactPair } from "@/lib/pipeline/match-candidates";
import { applyCascadeBands, selectMidBandIndexes } from "@/lib/rerank/cascade";
import { scorePairsWithCrossEncoder } from "@/lib/rerank/cross-encoder";
import { scorePairsWithLlm } from "@/lib/rerank/llm-rerank";
import { factPairTexts } from "@/lib/rerank/pair-text";

export type RerankStats = {
  provider: string;
  total: number;
  accepted: number;
  rejected: number;
  mid: number;
  llmUsed: number;
  kept: number;
};

export type RerankResult = {
  pairs: FactPair[];
  stats: RerankStats;
};

export type RerankDeps = {
  scoreCe?: (
    pairs: Array<{ query: string; doc: string }>,
  ) => Promise<number[]>;
  scoreLlm?: (
    pairs: Array<{ query: string; doc: string }>,
  ) => Promise<number[]>;
};

function toTexts(pairs: FactPair[]): Array<{ query: string; doc: string }> {
  return pairs.map((p) => factPairTexts(p.left, p.right));
}

function withRerankReason(pair: FactPair, detail: string, score: number): FactPair {
  return {
    ...pair,
    score,
    reason: `${pair.reason};rerank:${detail}`,
  };
}

/**
 * Cascade / CE / LLM rerank of hybrid candidate pairs.
 * Default: CE scores all; LLM only on mid-band (rare).
 */
export async function rerankFactPairs(
  pairs: FactPair[],
  deps: RerankDeps = {},
): Promise<RerankResult> {
  if (pairs.length === 0) {
    return {
      pairs: [],
      stats: {
        provider: getRerankProvider(),
        total: 0,
        accepted: 0,
        rejected: 0,
        mid: 0,
        llmUsed: 0,
        kept: 0,
      },
    };
  }

  const provider = getRerankProvider();
  const texts = toTexts(pairs);
  const scoreCe = deps.scoreCe ?? scorePairsWithCrossEncoder;
  const scoreLlm = deps.scoreLlm ?? scorePairsWithLlm;

  if (provider === "llm") {
    let llmScores: number[];
    try {
      llmScores = await scoreLlm(texts);
    } catch {
      // Fall back to input order with existing hybrid scores.
      const kept = pairs
        .filter((p) => p.score >= getRerankMinScore() || p.score > 0)
        .slice(0, getRerankTopM())
        .map((p) => withRerankReason(p, "llm_fallback_hybrid", p.score));
      return {
        pairs: kept,
        stats: {
          provider,
          total: pairs.length,
          accepted: 0,
          rejected: 0,
          mid: pairs.length,
          llmUsed: 0,
          kept: kept.length,
        },
      };
    }
    const ranked = pairs
      .map((p, i) =>
        withRerankReason(p, `llm=${(llmScores[i] ?? 0).toFixed(3)}`, llmScores[i] ?? 0),
      )
      .filter((p) => p.score >= getRerankMinScore())
      .sort((a, b) => b.score - a.score)
      .slice(0, getRerankTopM());
    return {
      pairs: ranked,
      stats: {
        provider,
        total: pairs.length,
        accepted: ranked.length,
        rejected: pairs.length - ranked.length,
        mid: 0,
        llmUsed: pairs.length,
        kept: ranked.length,
      },
    };
  }

  let ceScores: number[];
  try {
    ceScores = await scoreCe(texts);
  } catch {
    // CE unavailable: keep hybrid ranking, capped.
    const kept = pairs.slice(0, getRerankTopM()).map((p) =>
      withRerankReason(p, "ce_fallback_hybrid", p.score),
    );
    return {
      pairs: kept,
      stats: {
        provider,
        total: pairs.length,
        accepted: 0,
        rejected: 0,
        mid: 0,
        llmUsed: 0,
        kept: kept.length,
      },
    };
  }

  const llmScores: Array<number | null> = new Array(pairs.length).fill(null);

  if (provider === "cascade") {
    const midIdx = selectMidBandIndexes(ceScores);
    if (midIdx.length > 0) {
      try {
        const midTexts = midIdx.map((i) => texts[i]);
        const midScores = await scoreLlm(midTexts);
        midIdx.forEach((pairIndex, j) => {
          llmScores[pairIndex] = midScores[j] ?? null;
        });
      } catch {
        // Mid-band LLM failed — cascade continues on CE scores alone.
      }
    }
  }

  const { kept, stats } = applyCascadeBands({
    items: pairs,
    ceScores,
    llmScores,
  });

  return {
    pairs: kept.map((row) => {
      const detail = row.usedLlm
        ? `cascade:ce=${row.ceScore.toFixed(3)}+llm=${(row.llmScore ?? 0).toFixed(3)}`
        : `ce=${row.ceScore.toFixed(3)};band=${row.band}`;
      return withRerankReason(row.item, detail, row.finalScore);
    }),
    stats: { provider, ...stats },
  };
}
