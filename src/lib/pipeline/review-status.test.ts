import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";
import { ensureDb } from "@/lib/db";
import { closeDb } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import {
  getRelation,
  insertFact,
  insertRelation,
  listRelationsByReviewStatus,
  updateRelationReviewStatus,
} from "@/lib/db/facts";
import { decideReviewStatus } from "@/lib/pipeline/review-status";

describe("review_status HITL gate (stage 3)", () => {
  const prevDb = process.env.DATABASE_PATH;
  const prevThr = process.env.CONFLICT_REVIEW_THRESHOLD;
  const testDb = "data/test-review-status.db";

  beforeAll(() => {
    process.env.DATABASE_PATH = testDb;
    process.env.CONFLICT_REVIEW_THRESHOLD = "0.75";
    closeDb();
    try {
      fs.unlinkSync(testDb);
    } catch {
      /* fresh */
    }
    ensureDb();
  });

  afterAll(() => {
    closeDb();
    try {
      fs.unlinkSync(testDb);
    } catch {
      /* ignore */
    }
    if (prevDb === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = prevDb;
    if (prevThr === undefined) delete process.env.CONFLICT_REVIEW_THRESHOLD;
    else process.env.CONFLICT_REVIEW_THRESHOLD = prevThr;
    closeDb();
  });

  it("routes only low-confidence contradicts to needs_review", () => {
    expect(
      decideReviewStatus({ relationType: "contradicts", confidence: 0.5 }),
    ).toBe("needs_review");
    expect(
      decideReviewStatus({ relationType: "contradicts", confidence: 0.9 }),
    ).toBe("auto_accepted");
    expect(
      decideReviewStatus({ relationType: "corroborates", confidence: 0.4 }),
    ).toBe("auto_accepted");
    expect(
      decideReviewStatus({ relationType: "reconciled", confidence: 0.4 }),
    ).toBe("auto_accepted");
  });

  it("persists review_status on insert and lists needs_review", () => {
    const docA = randomUUID();
    const docB = randomUUID();
    const factA = randomUUID();
    const factB = randomUUID();
    for (const id of [docA, docB]) {
      insertDocument({
        id,
        original_filename: `${id}.pdf`,
        stored_path: `data/uploads/${id}.pdf`,
        mime_type: "application/pdf",
        byte_size: 1,
        content_hash: randomUUID(),
        status: "ready",
      });
    }
    for (const [id, doc] of [
      [factA, docA],
      [factB, docB],
    ] as const) {
      insertFact({
        id,
        document_id: doc,
        chunk_id: null,
        claim: "Revenue",
        raw_value: "100",
        numeric_value: 100,
        unit: "crore",
        period: "FY24",
        scope: null,
        entity: "Delhivery",
        fact_type: "revenue",
        confidence: 0.9,
        status: "active",
        match_key: "delhivery|revenue|crore",
      });
    }

    const weakId = randomUUID();
    insertRelation({
      id: weakId,
      fact_a_id: factA,
      fact_b_id: factB,
      relation_type: "contradicts",
      rationale: "conflict",
      context_tags: "[]",
      confidence: 0.5,
      review_status: decideReviewStatus({
        relationType: "contradicts",
        confidence: 0.5,
      }),
    });

    const needs = listRelationsByReviewStatus("needs_review");
    expect(needs.some((r) => r.id === weakId)).toBe(true);
    expect(needs.find((r) => r.id === weakId)?.review_status).toBe(
      "needs_review",
    );

    expect(updateRelationReviewStatus(weakId, "confirmed")).toBe(true);
    expect(getRelation(weakId)?.review_status).toBe("confirmed");
    expect(updateRelationReviewStatus(weakId, "rejected")).toBe(true);
    expect(getRelation(weakId)?.review_status).toBe("rejected");
  });
});
