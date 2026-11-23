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
