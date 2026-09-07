import { NextResponse } from "next/server";
import { getGroqFallbackModels, getGroqModel } from "@/lib/config";
import { ensureDb } from "@/lib/db";
import { getDb, getDbPath } from "@/lib/db/client";
import { getGroqApiKey } from "@/lib/llm/groq";

export const runtime = "nodejs";

/**
 * Detailed health (may open SQLite). Prefer /healthz for Render/cron liveness.
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
      service: "fact-knowledge-layer",
      dbPath: getDbPath(),
      dbTime: row.now,
      llm: {
        configured: hasKey,
        model: getGroqModel(),
        fallbacks: getGroqFallbackModels(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, alive: false, error: message }, { status: 500 });
  }
}
