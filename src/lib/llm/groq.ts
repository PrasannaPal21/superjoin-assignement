import Groq from "groq-sdk";
import { getGroqFallbackModels, getGroqModel } from "@/lib/config";

let client: Groq | null = null;

export function getGroqApiKey(): string | undefined {
  const key = process.env.GROQ_API_KEY?.trim();
  return key || undefined;
}

export function getGroq(): Groq {
  const key = getGroqApiKey();
  if (!key) {
    throw new Error(
      "GROQ_API_KEY is missing. Set it in .env and restart the server.",
    );
  }
  if (!client) {
    client = new Groq({ apiKey: key });
  }
  return client;
}

export function resetGroqClient(): void {
  client = null;
}

function isModelNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /model_not_found|does not exist|do not have access/i.test(msg);
}

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate limit|tokens per minute|tpm/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse "try again in 12.5s" / "Please try again in 2m" style hints when present. */
function retryDelayMs(err: unknown, attempt: number): number {
  const msg = err instanceof Error ? err.message : String(err);
  const sec = msg.match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (sec) return Math.ceil(Number(sec[1]) * 1000) + 250;
  const min = msg.match(/try again in\s+(\d+(?:\.\d+)?)\s*m/i);
  if (min) return Math.ceil(Number(min[1]) * 60_000) + 250;
  return Math.min(60_000, 8_000 * 2 ** attempt);
}

export async function chatJson(opts: {
  system: string;
  user: string;
  temperature?: number;
  /** Preferred model for this call (extract vs match). */
  model?: string;
}): Promise<string> {
  const groq = getGroq();
  const preferred = opts.model?.trim();
  const models = [preferred, getGroqModel(), ...getGroqFallbackModels()].filter(
    (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
  );

  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          temperature: opts.temperature ?? 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from Groq");
        }
        return content;
      } catch (err) {
        lastError = err;
        if (isRateLimited(err) && attempt < 4) {
          await sleep(retryDelayMs(err, attempt));
          continue;
        }
        if (isModelNotFound(err) && models.length > 1) break;
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Groq request failed for all configured models");
}

export function sanitizeUntrustedText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\uFEFF/g, "")
    .slice(0, 30_000);
}
