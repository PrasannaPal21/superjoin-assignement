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

/** Soft page target per chunk; packing also respects char budget. */
export function getChunkPages(): number {
  return Math.max(1, Number(process.env.CHUNK_PAGES || "8"));
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
  return Math.max(1, Number(process.env.MAX_CONCURRENT_EXTRACTIONS || "4"));
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
