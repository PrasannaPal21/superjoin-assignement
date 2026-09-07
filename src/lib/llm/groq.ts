import Groq from "groq-sdk";
import { getGroqModel } from "@/lib/config";

let client: Groq | null = null;

export function getGroq(): Groq {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY is not set");
  }
  if (!client) {
    client = new Groq({ apiKey: key });
  }
  return client;
}

export async function chatJson(opts: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  const groq = getGroq();
  const completion = await groq.chat.completions.create({
    model: getGroqModel(),
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
}

/** Strip control characters that can confuse parsers or prompt boundaries. */
export function sanitizeUntrustedText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\uFEFF/g, "")
    .slice(0, 30_000);
}
