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

export async function chatJson(opts: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  const groq = getGroq();
  const models = [getGroqModel(), ...getGroqFallbackModels()].filter(
    (m, i, arr) => m && arr.indexOf(m) === i,
  );

  let lastError: unknown;
  for (const model of models) {
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
      if (isModelNotFound(err) && models.length > 1) continue;
      throw err;
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
