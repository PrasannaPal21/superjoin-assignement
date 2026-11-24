import { hybridRetrieveEvidence } from "@/lib/embeddings/hybrid-ask";
import type { AskEvidenceHit } from "@/lib/embeddings/hybrid-ask";
import {
  gateAskContext,
  type AskContextDeps,
  type AskContextPack,
} from "@/lib/pipeline/ask-context";
import {
  generateAskAnswer,
  type AskGenerateDeps,
} from "@/lib/pipeline/ask-generate";
import { rerankAskEvidence, type AskRerankDeps } from "@/lib/pipeline/ask-rerank";
import type { AskAnswer } from "@/lib/llm/schemas";

export type AskQuestionOptions = {
  excludeDocumentId?: string;
  /** Precomputed query embedding (skips embed). */
  queryVector?: number[];
};

export type AskQuestionDeps = AskRerankDeps &
  AskGenerateDeps &
  AskContextDeps & {
    retrieve?: (
      question: string,
      opts?: AskQuestionOptions,
    ) => Promise<AskEvidenceHit[]>;
  };

export type AskQuestionResult = AskAnswer & {
  stats: {
    retrieved: number;
    reranked: number;
    rerankFallback: boolean;
    packed: number;
    bestScore: number;
    refusedAt: "retrieve" | "gate" | "generate" | null;
  };
  pack: AskContextPack | null;
};

/**
 * Ask path A5 orchestrator:
 * hybrid retrieve → CE rerank → refuse gate / context pack → grounded generate.
 */
export async function askQuestion(
  question: string,
  opts: AskQuestionOptions = {},
  deps: AskQuestionDeps = {},
): Promise<AskQuestionResult> {
  const q = (question ?? "").replace(/\s+/g, " ").trim();
  const emptyStats = {
    retrieved: 0,
    reranked: 0,
    rerankFallback: false,
    packed: 0,
    bestScore: 0,
    refusedAt: "retrieve" as const,
  };

  if (!q) {
    return {
      refused: true,
      answer: "",
      citations: [],
      reason: "Question is empty.",
      confidence: 0,
      stats: emptyStats,
      pack: null,
    };
  }

  const retrieve =
    deps.retrieve ??
    ((query: string, o?: AskQuestionOptions) =>
      hybridRetrieveEvidence(query, {
        excludeDocumentId: o?.excludeDocumentId,
        queryVector: o?.queryVector,
      }));

  const retrieved = await retrieve(q, opts);
  const { hits: reranked, stats: rerankStats } = await rerankAskEvidence(
    q,
    retrieved,
    { scoreCe: deps.scoreCe },
  );

  const gated = gateAskContext(
    q,
    reranked,
    {
      getFact: deps.getFact,
      getDocumentName: deps.getDocumentName,
      getChunk: deps.getChunk,
    },
  );

  if (gated.refuse) {
    return {
      refused: true,
      answer: "",
      citations: [],
      reason: gated.reason,
      confidence: gated.bestScore,
      stats: {
        retrieved: retrieved.length,
        reranked: reranked.length,
        rerankFallback: rerankStats.fallback,
        packed: 0,
        bestScore: gated.bestScore,
        refusedAt: "gate",
      },
      pack: null,
    };
  }

  const answer = await generateAskAnswer(gated.pack, {
    chatJson: deps.chatJson,
  });

  return {
    ...answer,
    stats: {
      retrieved: retrieved.length,
      reranked: reranked.length,
      rerankFallback: rerankStats.fallback,
      packed: gated.pack.items.length,
      bestScore: gated.pack.bestScore,
      refusedAt: answer.refused ? "generate" : null,
    },
    pack: gated.pack,
  };
}
