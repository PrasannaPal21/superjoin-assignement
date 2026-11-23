import path from "path";
import {
  getEmbeddingCacheDir,
  getRerankCacheDir,
  getRerankCeModel,
} from "@/lib/config";

type CePipeline = (
  input: { text: string; text_pair: string } | string,
  options?: { text_pair?: string; topk?: number },
) => Promise<unknown>;

let cePipeline: CePipeline | null = null;
let ceModelId: string | null = null;

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Normalize CE pipeline output to a relevance score in [0, 1]. */
export function normalizeCeScore(raw: unknown): number {
  if (typeof raw === "number") {
    if (raw >= 0 && raw <= 1) return raw;
    return clamp01(sigmoid(raw));
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return normalizeCeScore(raw[0]);
  }
  if (raw && typeof raw === "object") {
    const row = raw as {
      score?: number;
      logit?: number;
      label?: string;
    };
    if (typeof row.score === "number") {
      // ms-marco MiniLM often returns a single logit-like score or already sigmoided.
      if (row.score >= 0 && row.score <= 1) return row.score;
      return clamp01(sigmoid(row.score));
    }
    if (typeof row.logit === "number") return clamp01(sigmoid(row.logit));
  }
  return 0;
}

async function getCePipeline(): Promise<CePipeline> {
  const model = getRerankCeModel();
  if (cePipeline && ceModelId === model) return cePipeline;

  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = path.resolve(
    process.cwd(),
    getRerankCacheDir() || getEmbeddingCacheDir(),
  );
  env.allowLocalModels = true;

  cePipeline = (await pipeline(
    "text-classification",
    model,
  )) as CePipeline;
  ceModelId = model;
  return cePipeline;
}

/**
 * Score (query, doc) pairs with a local cross-encoder (Transformers.js ONNX).
 */
export async function scorePairsWithCrossEncoder(
  pairs: Array<{ query: string; doc: string }>,
): Promise<number[]> {
  if (pairs.length === 0) return [];
  const ranker = await getCePipeline();
  const scores: number[] = [];

  for (const pair of pairs) {
    const query = pair.query.replace(/\s+/g, " ").trim() || "unknown";
    const doc = pair.doc.replace(/\s+/g, " ").trim() || "unknown";
    let raw: unknown;
    try {
      raw = await ranker({ text: query, text_pair: doc });
    } catch {
      raw = await ranker(query, { text_pair: doc });
    }
    scores.push(normalizeCeScore(raw));
  }
  return scores;
}
