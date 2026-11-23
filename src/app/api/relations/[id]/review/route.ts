import { NextRequest, NextResponse } from "next/server";
import {
  getRelation,
  updateRelationReviewStatus,
  type ReviewStatus,
} from "@/lib/db/facts";
import { ensureDb } from "@/lib/db";

export const runtime = "nodejs";

const DECISIONS = new Set(["confirmed", "rejected"]);

/**
 * HITL confirm/reject for low-confidence conflicts (classify stage C5).
 * Body: { "decision": "confirmed" | "rejected" }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    ensureDb();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as {
      decision?: string;
    } | null;
    const decision = body?.decision?.trim().toLowerCase();

    if (!decision || !DECISIONS.has(decision)) {
      return NextResponse.json(
        { error: 'decision must be "confirmed" or "rejected"' },
        { status: 400 },
      );
    }

    const row = getRelation(id);
    if (!row) {
      return NextResponse.json({ error: "Relation not found" }, { status: 404 });
    }

    if (row.relation_type !== "contradicts") {
      return NextResponse.json(
        { error: "Only conflict relations can be reviewed" },
        { status: 400 },
      );
    }

    const reviewStatus = decision as ReviewStatus;
    const ok = updateRelationReviewStatus(id, reviewStatus);
    if (!ok) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    const updated = getRelation(id);
    return NextResponse.json({
      ok: true,
      id,
      reviewStatus: updated?.review_status ?? reviewStatus,
      relationType: updated?.relation_type,
      confidence: updated?.confidence,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "review failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
