import { z } from "zod";

export const ExtractedFactSchema = z.object({
  claim: z.string().min(1),
  rawValue: z.string().nullable().optional(),
  numericValue: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  period: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  entity: z.string().nullable().optional(),
  factType: z.string().min(1).default("other"),
  confidence: z.number().min(0).max(1).default(0.5),
  evidenceQuote: z.string().min(1),
  evidencePage: z.number().int().positive().nullable().optional(),
});

export const ExtractionResultSchema = z.object({
  facts: z.array(ExtractedFactSchema).default([]),
  notes: z.string().nullable().optional(),
});

export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const RelationClassificationSchema = z.object({
  relationType: z.enum(["corroborates", "contradicts", "reconciled", "unrelated"]),
  rationale: z.string(),
  contextTags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type RelationClassification = z.infer<typeof RelationClassificationSchema>;

/** Citation row for grounded Ask (A1 / API). */
export const AskCitationSchema = z.object({
  factId: z.string().min(1),
  documentId: z.string().min(1),
  page: z.number().int().positive().nullable().optional(),
  quote: z.string().min(1),
  evidenceId: z.string().min(1).optional(),
});

export type AskCitation = z.infer<typeof AskCitationSchema>;

/**
 * Grounded Ask LLM / API payload (A1).
 * When refused=true, answer may be empty and citations empty; reason required.
 */
export const AskAnswerSchema = z
  .object({
    refused: z.boolean().default(false),
    answer: z.string().default(""),
    citations: z.array(AskCitationSchema).default([]),
    reason: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.refused) {
      if (!val.reason || !val.reason.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "refused answers require a non-empty reason",
          path: ["reason"],
        });
      }
      return;
    }
    if (!val.answer.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "non-refused answers require a non-empty answer",
        path: ["answer"],
      });
    }
    if (!val.citations.length) {
      ctx.addIssue({
        code: "custom",
        message: "non-refused answers require at least one citation",
        path: ["citations"],
      });
    }
  });

export type AskAnswer = z.infer<typeof AskAnswerSchema>;

/** Normalize / soft-parse Ask JSON without throwing (A4 will use this). */
export function normalizeAskAnswer(raw: unknown): AskAnswer | null {
  const parsed = AskAnswerSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
