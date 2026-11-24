import {
  getAskRerankMinScore,
  getAskRerankTopM,
} from "@/lib/config";
import type { AskEvidenceHit } from "@/lib/embeddings/hybrid-ask";
import { scorePairsWithCrossEncoder } from "@/lib/rerank/cross-encoder";
import { askEvidencePairTexts } from "@/lib/rerank/pair-text";

export type AskRerankStats = {
  provider: "cross_encoder";
  total: number;
  kept: number;
  fallback: boolean;
};

export type AskRerankResult = {
  hits: AskEvidenceHit[];
  stats: AskRerankStats;
};

export type AskRerankDeps = {
  scoreCe?: (
    pairs: Array<{ query: string; doc: string }>,
  ) => Promise<number[]>;
};

/**
 * Ask path A2: CE-rerank hybrid evidence hits for a question.
 * Scores (question, evidence quote); keeps top-M above ASK_RERANK_MIN_SCORE.
 * On CE failure, falls back to hybrid RRF order (capped).
 */
export async function rerankAskEvidence(
  question: string,
  hits: AskEvidenceHit[],
  deps: AskRerankDeps = {},
): Promise<AskRerankResult> {
  const topM = getAskRerankTopM();
  const minScore = getAskRerankMinScore();

  if (hits.length === 0) {
    return {
      hits: [],
      stats: {
        provider: "cross_encoder",
        total: 0,
        kept: 0,
        fallback: false,
      },
    };
  }

  const q = (question ?? "").replace(/\s+/g, " ").trim();
  if (!q) {
    return {
      hits: hits.slice(0, topM),
      stats: {
        provider: "cross_encoder",
        total: hits.length,
        kept: Math.min(hits.length, topM),
        fallback: true,
      },
    };
  }

  const texts = hits.map((h) =>
    askEvidencePairTexts(q, { page: h.page, quote: h.quote }),
  );
  const scoreCe = deps.scoreCe ?? scorePairsWithCrossEncoder;

  let ceScores: number[];
  try {
    ceScores = await scoreCe(texts);
  } catch {
    const kept = hits.slice(0, topM);
    return {
      hits: kept,
      stats: {
        provider: "cross_encoder",
        total: hits.length,
        kept: kept.length,
        fallback: true,
      },
    };
  }

  const ranked = hits
    .map((hit, i) => ({
      ...hit,
      score: ceScores[i] ?? 0,
    }))
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topM);

  return {
    hits: ranked,
    stats: {
      provider: "cross_encoder",
      total: hits.length,
      kept: ranked.length,
      fallback: false,
    },
  };
}
