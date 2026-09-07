import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getDb, getDbPath } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    ensureDb();
    const row = getDb().prepare("SELECT datetime('now') AS now").get() as {
      now: string;
    };

    return NextResponse.json({
      ok: true,
      service: "fact-knowledge-layer",
      dbPath: getDbPath(),
      dbTime: row.now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
