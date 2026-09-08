import { NextResponse } from "next/server";
import { rematchAllDocuments } from "@/lib/pipeline/match";

export const runtime = "nodejs";

/** Rebuild comparisons from facts already in the DB (no re-extract). */
export async function POST() {
  try {
    const result = await rematchAllDocuments();
    return NextResponse.json({
      ok: true,
      message:
        result.relationsWritten > 0
          ? `Wrote ${result.relationsWritten} comparisons across ${result.documentsMatched} documents.`
          : "Rematch finished but found no overlapping fact pairs. Reprocess PDFs if extraction was sparse (rate limits).",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "rematch failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
