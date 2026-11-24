export function suggestionForError(stage: string, message: string): string {
  if (/GROQ_API_KEY/i.test(message)) {
    return "Set GROQ_API_KEY in .env (or deployment env) and restart the Node process.";
  }
  if (/model_not_found|does not exist|do not have access/i.test(message)) {
    return "Update GROQ_MODEL to a live Groq model (default: openai/gpt-oss-120b) and restart.";
  }
  if (/rate limit|429|too many/i.test(message)) {
    return "Back off concurrent extractions (MAX_CONCURRENT_EXTRACTIONS) or retry after the rate window.";
  }
  if (/password/i.test(message)) {
    return "Remove PDF password protection before upload.";
  }
  if (stage === "parse") {
    return "Check OCR_ENABLED=true, raise OCR_MAX_PAGES / OCR_RENDER_SCALE for scans, or supply a clearer text-layer PDF.";
  }
  if (stage === "match") {
    return "Extracted facts were kept. Re-queue matching after the model endpoint is healthy.";
  }
  if (stage === "embed") {
    if (/EMBEDDING_API_KEY|HTTP/i.test(message)) {
      return "For EMBEDDING_PROVIDER=http set EMBEDDING_API_KEY; or switch to EMBEDDING_PROVIDER=local (default MiniLM).";
    }
    return "Facts were kept. Fix the embedding provider/model, then re-process to fill fact_embeddings.";
  }
  if (stage === "sparse") {
    return "Facts were kept. Re-process the document to rebuild sparse/BM25 postings.";
  }
  if (stage === "rerank") {
    return "Hybrid pairs were kept. Check RERANK_CE_MODEL cache or set RERANK_PROVIDER=llm; rematch when healthy.";
  }
  if (stage === "ask") {
    return "Check embeddings index, ASK_REFUSE_* thresholds, GROQ_ASK_MODEL, and retry the question.";
  }
  if (stage === "extract") {
    return "Check GROQ_API_KEY / GROQ_EXTRACT_MODEL, lower MAX_EXTRACT_CHUNKS if rate-limited, then re-process.";
  }
  return "Inspect the error detail, fix configuration, and re-upload or re-process the document.";
}
