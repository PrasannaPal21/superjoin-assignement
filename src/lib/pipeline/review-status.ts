import { getConflictReviewThreshold } from "@/lib/config";

export type ReviewStatus =
  | "auto_accepted"
  | "needs_review"
  | "confirmed"
  | "rejected";

/**
 * HITL gate (classify stage 3): weak contradicts need human review.
 * All other stored relation types auto-accept.
 */
export function decideReviewStatus(opts: {
  relationType: string;
  confidence: number;
  threshold?: number;
}): ReviewStatus {
  const threshold = opts.threshold ?? getConflictReviewThreshold();
  if (
    opts.relationType === "contradicts" &&
    opts.confidence < threshold
  ) {
    return "needs_review";
  }
  return "auto_accepted";
}
