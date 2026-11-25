import path from "path";
import {
  getEmbeddingCacheDir,
  getRerankCacheDir,
  getRerankCeModel,
} from "@/lib/config";

type CeTokenizer = (
  texts: string | string[],
  options?: {
    text_pair?: string | string[];
    padding?: boolean | string;
    truncation?: boolean;
    max_length?: number;
  },
) => Record<string, unknown>;

type CeModel = (inputs: Record<string, unknown>) => Promise<{
  logits?: { data?: ArrayLike<number>; dims?: number[] };
}>;

let ceTokenizer: CeTokenizer | null = null;
let ceModel: CeModel | null = null;
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

/** Normalize CE pipeline/model output to a relevance score in [0, 1]. */
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

async function getCeModel(): Promise<{
  tokenizer: CeTokenizer;
  model: CeModel;
}> {
  const modelId = getRerankCeModel();
  if (ceTokenizer && ceModel && ceModelId === modelId) {
    return { tokenizer: ceTokenizer, model: ceModel };
  }

  const { AutoTokenizer, AutoModelForSequenceClassification, env } =
    await import("@huggingface/transformers");
  env.cacheDir = path.resolve(
    process.cwd(),
    getRerankCacheDir() || getEmbeddingCacheDir(),
  );
  env.allowLocalModels = true;

  // Bypass text-classification pipeline: softmax over a single logit is always 1.0.
  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(modelId),
    AutoModelForSequenceClassification.from_pretrained(modelId),
  ]);

  ceTokenizer = tokenizer as unknown as CeTokenizer;
  ceModel = model as unknown as CeModel;
  ceModelId = modelId;
  return { tokenizer: ceTokenizer, model: ceModel };
}

function logitsToScores(
  logits: { data?: ArrayLike<number>; dims?: number[] } | undefined,
  expected: number,
): number[] {
  if (!logits?.data) return Array.from({ length: expected }, () => 0);
  const data = logits.data;
  const dims = logits.dims ?? [expected, 1];
  const batch = dims[0] ?? expected;
  const numLabels = dims[1] ?? Math.max(1, Math.floor(data.length / batch));
  const out: number[] = [];
  for (let i = 0; i < batch; i++) {
    // Single-logit CE head → sigmoid(logit). Multi-label: positive class if present.
    const logit =
      numLabels === 1
        ? Number(data[i])
        : Number(data[i * numLabels + Math.min(1, numLabels - 1)]);
    out.push(clamp01(sigmoid(logit)));
  }
  while (out.length < expected) out.push(0);
  return out.slice(0, expected);
}

/**
 * Score (query, doc) pairs with a local cross-encoder (Transformers.js ONNX).
 * Uses AutoModelForSequenceClassification + raw logits (not text-classification).
 */
export async function scorePairsWithCrossEncoder(
  pairs: Array<{ query: string; doc: string }>,
): Promise<number[]> {
  if (pairs.length === 0) return [];
  const { tokenizer, model } = await getCeModel();

  const queries = pairs.map(
    (p) => p.query.replace(/\s+/g, " ").trim() || "unknown",
  );
  const docs = pairs.map(
    (p) => p.doc.replace(/\s+/g, " ").trim() || "unknown",
  );

  // Score in small batches to keep memory bounded on CPU.
  const batchSize = 8;
  const scores: number[] = [];
  for (let i = 0; i < pairs.length; i += batchSize) {
    const qBatch = queries.slice(i, i + batchSize);
    const dBatch = docs.slice(i, i + batchSize);
    const inputs = tokenizer(qBatch, {
      text_pair: dBatch,
      padding: true,
      truncation: true,
      max_length: 512,
    });
    const output = await model(inputs);
    scores.push(...logitsToScores(output.logits, qBatch.length));
  }
  return scores;
}
