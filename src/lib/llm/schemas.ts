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
