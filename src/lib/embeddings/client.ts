import path from "path";
import {
  getEmbeddingApiKey,
  getEmbeddingBaseUrl,
  getEmbeddingBatchSize,
  getEmbeddingCacheDir,
  getEmbeddingDimensions,
  getEmbeddingModel,
  getEmbeddingProvider,
  isEmbeddingsConfigured,
} from "@/lib/config";

export type EmbedResult = {
  vectors: number[][];
  model: string;
  dimensions: number;
  provider: "local" | "http";
};

/** L2-normalize so cosine similarity = dot product. */
export function l2Normalize(vector: number[]): number[] {
  let sumSq = 0;
  for (const x of vector) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (!Number.isFinite(norm) || norm === 0) {
    return vector.map(() => 0);
  }
  return vector.map((x) => x / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

// --- Local open-source path (default): Transformers.js + MiniLM ---

type FeaturePipeline = (
  texts: string | string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist: () => number[][] | number[]; data?: Float32Array; dims?: number[] }>;

let localPipeline: FeaturePipeline | null = null;
let localPipelineModel: string | null = null;

async function getLocalPipeline(): Promise<FeaturePipeline> {
  const model = getEmbeddingModel();
  if (localPipeline && localPipelineModel === model) return localPipeline;

  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = path.resolve(process.cwd(), getEmbeddingCacheDir());
  // Allow model download on first run; thereafter offline from cache.
  env.allowLocalModels = true;

  localPipeline = (await pipeline("feature-extraction", model)) as FeaturePipeline;
  localPipelineModel = model;
  return localPipeline;
}

async function embedLocal(texts: string[]): Promise<number[][]> {
  const extractor = await getLocalPipeline();
  const batchSize = getEmbeddingBatchSize();
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const tensor = await extractor(batch, { pooling: "mean", normalize: true });
    const list = tensor.tolist();
    const rows: number[][] = Array.isArray(list[0])
      ? (list as number[][])
      : [list as number[]];
    for (const row of rows) {
      out.push(l2Normalize(row.map(Number)));
    }
  }
  return out;
}

// --- Optional HTTP path (not default; for hosted free/paid OpenAI-compatible APIs) ---

type EmbeddingApiResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
};

async function embedHttpBatch(texts: string[]): Promise<number[][]> {
  const key = getEmbeddingApiKey();
  if (!key) {
    throw new Error("EMBEDDING_API_KEY required when EMBEDDING_PROVIDER=http");
  }

  const res = await fetch(`${getEmbeddingBaseUrl()}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getEmbeddingModel(),
      input: texts,
    }),
  });

  const json = (await res.json()) as EmbeddingApiResponse;
  if (!res.ok) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
  const rows = json.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Embedding API returned no vectors");
  }
  return [...rows]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row, i) => {
      const emb = row.embedding;
      if (!Array.isArray(emb) || emb.length === 0) {
        throw new Error(`Embedding missing for input index ${i}`);
      }
      return l2Normalize(emb.map(Number));
    });
}

async function embedHttp(texts: string[]): Promise<number[][]> {
  const batchSize = getEmbeddingBatchSize();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    out.push(...(await embedHttpBatch(texts.slice(i, i + batchSize))));
  }
  return out;
}

/**
 * Embed texts with the configured provider (default: free local MiniLM).
 */
export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  const cleaned = texts.map((t) => (t ?? "").replace(/\s+/g, " ").trim());
  if (cleaned.some((t) => !t)) {
    throw new Error("embedTexts: empty string in input");
  }

  const provider = getEmbeddingProvider();
  const model = getEmbeddingModel();

  if (cleaned.length === 0) {
    return {
      vectors: [],
      model,
      dimensions: getEmbeddingDimensions(),
      provider,
    };
  }

  const vectors =
    provider === "http" ? await embedHttp(cleaned) : await embedLocal(cleaned);

  const dimensions = vectors[0]?.length ?? 0;
  const expected = getEmbeddingDimensions();
  if (expected > 0 && dimensions !== expected) {
    throw new Error(
      `Embedding dim mismatch: got ${dimensions}, expected EMBEDDING_DIMENSIONS=${expected}`,
    );
  }

  return { vectors, model, dimensions, provider };
}

export async function embedText(text: string): Promise<number[]> {
  const { vectors } = await embedTexts([text]);
  return vectors[0];
}

export {
  getEmbeddingModel,
  getEmbeddingProvider,
  isEmbeddingsConfigured,
};
