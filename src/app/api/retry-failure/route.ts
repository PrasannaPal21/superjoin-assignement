import { NextRequest, NextResponse } from "next/server";
import { retryFailure, retryFailures } from "@/lib/pipeline/retry-failure";

export const runtime = "nodejs";

/**
 * Targeted stage retry for Issues journal entries.
 * Never wipes a Ready document's facts unless the doc itself failed parse.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    failureId?: unknown;
    failureIds?: unknown;
  } | null;

  const ids = Array.isArray(body?.failureIds)
    ? body.failureIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : typeof body?.failureId === "string" && body.failureId.trim()
      ? [body.failureId]
      : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Provide failureId or failureIds" },
      { status: 400 },
    );
  }

  try {
    if (ids.length === 1) {
      const result = await retryFailure(ids[0]);
      if (!result.ok && result.action === "none") {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json({ ok: result.ok, ...result });
    }

    const batch = await retryFailures(ids);
    return NextResponse.json({
      ok: batch.okCount > 0,
      message: `Retried ${batch.okCount}/${batch.results.length} failure(s) with stage-specific actions.`,
      ...batch,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retry failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
