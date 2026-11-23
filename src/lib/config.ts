import path from "path";

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || "data/uploads";
}

export function getMaxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB || "40");
  return Math.max(1, mb) * 1024 * 1024;
}

export function getMaxPages(): number {
  return Math.max(1, Number(process.env.MAX_PAGES || "500"));
}

/** Run local Tesseract when pdf.js text is sparse. Default on. */
export function isOcrEnabled(): boolean {
  const raw = process.env.OCR_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

/** Pages with fewer than this many chars are OCR candidates. */
export function getOcrMinTextChars(): number {
  return Math.max(0, Number(process.env.OCR_MIN_TEXT_CHARS || "40"));
}

/** pdf.js render scale for OCR (higher = sharper, slower). */
export function getOcrRenderScale(): number {
  return Math.min(3, Math.max(1, Number(process.env.OCR_RENDER_SCALE || "2")));
}

/** Cap how many pages we OCR per document (cost/latency guard). */
export function getOcrMaxPages(): number {
  return Math.max(1, Number(process.env.OCR_MAX_PAGES || "80"));
}

export function getOcrLang(): string {
  return process.env.OCR_LANG?.trim() || "eng";
}

export function getOcrConcurrency(): number {
  return Math.max(1, Number(process.env.OCR_CONCURRENCY || "1"));
}

/** Minimum page signal score to enter extract packing (budget prior). */
export function getSignalMinScore(): number {
  return Math.max(0, Number(process.env.SIGNAL_MIN_SCORE || "0.8"));
}

/** Child narrative pack targets (approx tokens; chars≈tokens*4). */
export function getChildMinTokens(): number {
  return Math.max(50, Number(process.env.CHILD_MIN_TOKENS || "200"));
}

export function getChildMaxTokens(): number {
  return Math.max(getChildMinTokens(), Number(process.env.CHILD_MAX_TOKENS || "800"));
}

/** Rows per table child (header repeated each group). */
export function getChildTableRows(): number {
  return Math.max(1, Number(process.env.CHILD_TABLE_ROWS || "5"));
}

export function getChunkCharBudget(): number {
  return Math.max(4000, Number(process.env.CHUNK_CHAR_BUDGET || "12000"));
}

/** Keep only the highest-signal chunks to bound extract API spend. */
export function getMaxExtractChunks(): number {
  return Math.max(4, Number(process.env.MAX_EXTRACT_CHUNKS || "16"));
}

export function getMaxMatchPairs(): number {
  return Math.max(4, Number(process.env.MAX_MATCH_PAIRS || "16"));
}

export function getMatchBatchSize(): number {
  return Math.max(2, Number(process.env.MATCH_BATCH_SIZE || "6"));
}

export function getMaxConcurrentJobs(): number {
  return Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || "1"));
}

export function getMaxConcurrentExtractions(): number {
  // Default 1 to stay under free-tier Groq TPM when packing large chunks.
  return Math.max(1, Number(process.env.MAX_CONCURRENT_EXTRACTIONS || "1"));
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
}

/** Prefer a cheaper/faster model for bulk extraction when set. */
export function getGroqExtractModel(): string {
  return process.env.GROQ_EXTRACT_MODEL?.trim() || "openai/gpt-oss-20b";
}

export function getGroqMatchModel(): string {
  return process.env.GROQ_MATCH_MODEL?.trim() || getGroqModel();
}

/**
 * Embedding backend:
 * - `local` (default) — free open-source ONNX model via @huggingface/transformers
 * - `http` — optional OpenAI-compatible HTTP API (not required)
 */
export function getEmbeddingProvider(): "local" | "http" {
  const raw = process.env.EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (raw === "http" || raw === "api" || raw === "openai") return "http";
  return "local";
}

/** Hugging Face / Xenova model id for local embeddings. */
export function getEmbeddingModel(): string {
  return (
    process.env.EMBEDDING_MODEL?.trim() || "Xenova/all-MiniLM-L6-v2"
  );
}

/** MiniLM-L6-v2 = 384 dims; override if you swap models. */
export function getEmbeddingDimensions(): number {
  const n = Number(process.env.EMBEDDING_DIMENSIONS || "384");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 384;
}

export function getEmbeddingBatchSize(): number {
  return Math.max(1, Number(process.env.EMBEDDING_BATCH_SIZE || "16"));
}

/** Cache dir for downloaded ONNX weights (local provider). */
export function getEmbeddingCacheDir(): string {
  return process.env.EMBEDDING_CACHE_DIR?.trim() || ".cache/embeddings";
}

/** Optional HTTP embeddings (paid/free hosted). Unused when provider=local. */
export function getEmbeddingApiKey(): string | undefined {
  const key = process.env.EMBEDDING_API_KEY?.trim();
  return key || undefined;
}

export function getEmbeddingBaseUrl(): string {
  return (
    process.env.EMBEDDING_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://api.openai.com/v1"
  );
}

/** Local provider needs no key; HTTP needs EMBEDDING_API_KEY. */
export function isEmbeddingsConfigured(): boolean {
  if (getEmbeddingProvider() === "local") return true;
  return Boolean(getEmbeddingApiKey());
}

/** Tried in order when the primary model returns model_not_found. */
export function getGroqFallbackModels(): string[] {
  const raw = process.env.GROQ_FALLBACK_MODELS || "openai/gpt-oss-20b";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveUnderRoot(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}
