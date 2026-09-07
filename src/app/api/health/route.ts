import { NextResponse } from "next/server";
import { getGroqFallbackModels, getGroqModel } from "@/lib/config";
import { ensureDb } from "@/lib/db";
import { getDb, getDbPath } from "@/lib/db/client";
import { getGroqApiKey } from "@/lib/llm/groq";

export const runtime = "nodejs";

/**
 * Liveness for hosts (Render health checks). Always 200 if the process + DB are up.
 * LLM readiness is reported in the JSON body — do not 503 or Render will kill deploys.
 */
export async function GET() {
  try {
    ensureDb();
    const row = getDb().prepare("SELECT datetime('now') AS now").get() as {
      now: string;
    };

    const hasKey = Boolean(getGroqApiKey());
    return NextResponse.json({
      ok: hasKey,
      alive: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, alive: false, error: message }, { status: 500 });
  }
}
