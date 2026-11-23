import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";
import { ensureDb } from "@/lib/db";
import { closeDb, getDbPath } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import {
  upsertEvidenceEmbedding,
  upsertFactEmbedding,
} from "@/lib/db/embeddings";
import { insertEvidence, insertFact } from "@/lib/db/facts";
import { l2Normalize } from "@/lib/embeddings/client";
import { denseSearch, denseSearchEvidence } from "@/lib/embeddings/dense";

describe("dense search (embeddings step 6)", () => {
  const prevDb = process.env.DATABASE_PATH;
  const prevModel = process.env.EMBEDDING_MODEL;
  const testDb = "data/test-dense.db";
  const model = "Xenova/all-MiniLM-L6-v2";

  beforeAll(() => {
    process.env.DATABASE_PATH = testDb;
    process.env.EMBEDDING_MODEL = model;
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
    if (prevModel === undefined) delete process.env.EMBEDDING_MODEL;
    else process.env.EMBEDDING_MODEL = prevModel;
    closeDb();
  });

  it("ranks paraphrase-like vectors above unrelated ones", () => {
    expect(getDbPath()).toContain("test-dense");

    const docA = randomUUID();
    const docB = randomUUID();
    const revenueId = randomUUID();
    const fleetId = randomUUID();
    const evidenceId = randomUUID();

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

    insertFact({
      id: revenueId,
      document_id: docA,
      chunk_id: null,
      claim: "Revenue from operations",
      raw_value: "8143",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
      scope: null,
      entity: "Delhivery",
      fact_type: "revenue",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|revenue|crore",
    });
    insertFact({
      id: fleetId,
      document_id: docB,
      chunk_id: null,
      claim: "Owned fleet vehicles",
      raw_value: "12000",
      numeric_value: 12000,
      unit: "vehicles",
      period: "FY24",
      scope: null,
      entity: "Delhivery",
      fact_type: "fleet",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|fleet|vehicles",
    });
    insertEvidence({
      id: evidenceId,
      fact_id: revenueId,
      document_id: docA,
      page: 1,
      quote: "Revenue from operations was 8143 crore",
    });

    // Query ≈ revenue direction; fleet nearly orthogonal.
    const revenueVec = l2Normalize([1, 0.1, 0, 0]);
    const paraphraseVec = l2Normalize([0.95, 0.15, 0.05, 0]);
    const fleetVec = l2Normalize([0, 0, 1, 0.1]);

    upsertFactEmbedding({
      factId: revenueId,
      model,
      embedding: revenueVec,
      indexText: "Delhivery | revenue | Revenue from operations",
    });
    upsertFactEmbedding({
      factId: fleetId,
      model,
      embedding: fleetVec,
      indexText: "Delhivery | fleet | Owned fleet vehicles",
    });
    upsertEvidenceEmbedding({
      evidenceId,
      model,
      embedding: revenueVec,
      indexText: "page=1 | Revenue from operations was 8143 crore",
    });

    const hits = denseSearch(paraphraseVec, 5);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].factId).toBe(revenueId);
    expect(hits[0].score).toBeGreaterThan(
      hits.find((h) => h.factId === fleetId)?.score ?? -1,
    );

    const outside = denseSearch(paraphraseVec, 5, {
      excludeDocumentId: docA,
    });
    expect(outside.every((h) => h.factId !== revenueId)).toBe(true);
    expect(outside.some((h) => h.factId === fleetId)).toBe(true);

    const evHits = denseSearchEvidence(paraphraseVec, 5);
    expect(evHits[0]?.evidenceId).toBe(evidenceId);
    expect(evHits[0]?.score).toBeGreaterThan(0.5);
  });
});
