import { afterEach, describe, expect, it } from "vitest";
import {
  getClassifyConfig,
  getConflictReviewThreshold,
} from "@/lib/config";

describe("classify / HITL config (stage 4)", () => {
  const prev = process.env.CONFLICT_REVIEW_THRESHOLD;
  const prevBatch = process.env.MATCH_BATCH_SIZE;

  afterEach(() => {
    if (prev === undefined) delete process.env.CONFLICT_REVIEW_THRESHOLD;
    else process.env.CONFLICT_REVIEW_THRESHOLD = prev;
    if (prevBatch === undefined) delete process.env.MATCH_BATCH_SIZE;
    else process.env.MATCH_BATCH_SIZE = prevBatch;
  });

  it("clamps CONFLICT_REVIEW_THRESHOLD to [0,1]", () => {
    process.env.CONFLICT_REVIEW_THRESHOLD = "1.5";
    expect(getConflictReviewThreshold()).toBe(1);
    process.env.CONFLICT_REVIEW_THRESHOLD = "-0.2";
    expect(getConflictReviewThreshold()).toBe(0);
    process.env.CONFLICT_REVIEW_THRESHOLD = "0.75";
    expect(getConflictReviewThreshold()).toBeCloseTo(0.75, 5);
  });

  it("exposes classify config snapshot", () => {
    process.env.CONFLICT_REVIEW_THRESHOLD = "0.8";
    process.env.MATCH_BATCH_SIZE = "4";
    const snap = getClassifyConfig();
    expect(snap.conflictReviewThreshold).toBeCloseTo(0.8, 5);
    expect(snap.matchBatchSize).toBe(4);
    expect(snap.matchModel.length).toBeGreaterThan(0);
  });
});
