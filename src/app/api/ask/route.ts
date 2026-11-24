import { NextRequest, NextResponse } from "next/server";
import { askQuestion } from "@/lib/pipeline/ask";

export const runtime = "nodejs";

/**
 * Classical grounded Ask (A5).
 * Body: { question: string, excludeDocumentId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      question?: unknown;
      excludeDocumentId?: unknown;
    } | null;

    const question =
      typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json(
        { error: "question (string) is required" },
        { status: 400 },
      );
    }

    const excludeDocumentId =
      typeof body?.excludeDocumentId === "string" &&
      body.excludeDocumentId.trim()
        ? body.excludeDocumentId.trim()
        : undefined;

    const result = await askQuestion(question, { excludeDocumentId });

    return NextResponse.json({
      refused: result.refused,
      answer: result.answer,
      citations: result.citations,
      reason: result.reason ?? null,
      confidence: result.confidence ?? null,
      stats: result.stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ask failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
