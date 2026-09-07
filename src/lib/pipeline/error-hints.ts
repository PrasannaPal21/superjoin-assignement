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
    return "Prefer text-based PDFs, or enable an OCR lane for scanned pages.";
  }
  if (stage === "match") {
    return "Extracted facts were kept. Re-queue matching after the model endpoint is healthy.";
  }
  return "Inspect the error detail, fix configuration, and re-upload or re-process the document.";
}
