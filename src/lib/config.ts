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

export function getChunkPages(): number {
  return Math.max(1, Number(process.env.CHUNK_PAGES || "3"));
}

export function getMaxConcurrentJobs(): number {
  return Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || "1"));
}

export function getMaxConcurrentExtractions(): number {
  return Math.max(1, Number(process.env.MAX_CONCURRENT_EXTRACTIONS || "2"));
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
}

export function resolveUnderRoot(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}
