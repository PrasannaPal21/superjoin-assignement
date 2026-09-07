import { NextResponse } from "next/server";
import { getGroqFallbackModels, getGroqModel } from "@/lib/config";
import { ensureDb } from "@/lib/db";
import { getDb, getDbPath } from "@/lib/db/client";
import { getGroqApiKey } from "@/lib/llm/groq";

export const runtime = "nodejs";

export async function GET() {
  try {
    ensureDb();
    const row = getDb().prepare("SELECT datetime('now') AS now").get() as {
      now: string;
    };

    const hasKey = Boolean(getGroqApiKey());
    return NextResponse.json({
      ok: hasKey,
      service: "fact-knowledge-layer",
      dbPath: getDbPath(),
      dbTime: row.now,
      llm: {
        configured: hasKey,
        model: getGroqModel(),
        fallbacks: getGroqFallbackModels(),
      },
    }, { status: hasKey ? 200 : 503 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
