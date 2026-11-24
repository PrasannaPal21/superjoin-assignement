import { describe, expect, it } from "vitest";
import {
  AskAnswerSchema,
  AskCitationSchema,
  normalizeAskAnswer,
} from "@/lib/llm/schemas";

describe("Ask schemas (stage A1)", () => {
  it("accepts a grounded answer with citations", () => {
    const ok = AskAnswerSchema.safeParse({
      refused: false,
      answer: "Revenue was ₹8,143 crore in FY24.",
      citations: [
        {
          factId: "f1",
          documentId: "d1",
          page: 12,
          quote: "Revenue from operations … 8,143",
          evidenceId: "e1",
        },
      ],
      confidence: 0.82,
    });
    expect(ok.success).toBe(true);
  });

  it("requires reason when refused", () => {
    expect(
      AskAnswerSchema.safeParse({
        refused: true,
        answer: "",
        citations: [],
      }).success,
    ).toBe(false);
    expect(
      AskAnswerSchema.safeParse({
        refused: true,
        reason: "No sufficiently relevant evidence retrieved.",
        citations: [],
      }).success,
    ).toBe(true);
  });

  it("rejects non-refused answers without citations", () => {
    expect(
      AskAnswerSchema.safeParse({
        refused: false,
        answer: "Something",
        citations: [],
      }).success,
    ).toBe(false);
  });

  it("normalizes soft-parse without throwing", () => {
    expect(normalizeAskAnswer({ refused: false, answer: "x" })).toBeNull();
    expect(
      normalizeAskAnswer({
        refused: true,
        reason: "weak retrieval",
      }),
    ).toMatchObject({ refused: true, reason: "weak retrieval" });
  });

  it("validates citation shape", () => {
    expect(
      AskCitationSchema.safeParse({
        factId: "f",
        documentId: "d",
        quote: "q",
        page: null,
      }).success,
    ).toBe(true);
    expect(
      AskCitationSchema.safeParse({
        factId: "",
        documentId: "d",
        quote: "q",
      }).success,
    ).toBe(false);
  });
});
