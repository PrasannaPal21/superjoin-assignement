import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Pure liveness for Render / cron. Do NOT open SQLite or load native addons here —
 * better-sqlite3 has caused segfaults on free-tier instances when hit at boot.
 */
export async function GET() {
  return NextResponse.json(
    {
      alive: true,
      service: "fact-knowledge-layer",
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
