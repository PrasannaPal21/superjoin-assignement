import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { insertFailure } from "@/lib/db/facts";
import { suggestionForError } from "@/lib/pipeline/error-hints";
import { askQuestion } from "@/lib/pipeline/ask";
import { takeToken } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/**
 * Classical grounded Ask (A5).
 * Body: { question: string, excludeDocumentId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "local";
    if (!takeToken(`ask:${ip}`, { capacity: 8, refillPerMs: 60_000 / 8 })) {
      return NextResponse.json(
        { error: "Too many Ask requests; retry shortly." },
        { status: 429 },
      );
    }

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

    if (result.stats.rerankFallback) {
      insertFailure({
        id: randomUUID(),
        document_id: null,
        stage: "ask",
        summary: "Ask CE rerank fell back to hybrid order",
        detail: `question=${question.slice(0, 120)}`,
        suggestion: suggestionForError("ask", "CE fallback"),
      });
    }

    if (
      result.refused &&
      result.stats.refusedAt === "generate" &&
      /error|unparseable|invalid|failed|schema/i.test(result.reason ?? "")
    ) {
      insertFailure({
        id: randomUUID(),
        document_id: null,
        stage: "ask",
        summary: "Ask generate failed after retrieval",
        detail: result.reason ?? "generate error",
        suggestion: suggestionForError("ask", result.reason ?? "generate"),
      });
    }

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
    insertFailure({
      id: randomUUID(),
      document_id: null,
      stage: "ask",
      summary: "Ask request aborted",
      detail: message,
      suggestion: suggestionForError("ask", message),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
