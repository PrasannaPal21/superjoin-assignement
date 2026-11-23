import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";
import { ensureDb } from "@/lib/db";
import { closeDb } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import { upsertFactEmbedding } from "@/lib/db/embeddings";
import { insertFact } from "@/lib/db/facts";
import { l2Normalize } from "@/lib/embeddings/client";
import { hybridRetrieveForFact } from "@/lib/embeddings/hybrid";
import { indexDocumentSparse } from "@/lib/embeddings/sparse";
import { reciprocalRankFusion } from "@/lib/embeddings/rrf";
import { findCandidatePairs } from "@/lib/pipeline/match-candidates";

describe("RRF + hybrid recall (embeddings step 7)", () => {
  const prevDb = process.env.DATABASE_PATH;
  const prevModel = process.env.EMBEDDING_MODEL;
  const testDb = "data/test-hybrid.db";
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

  it("fuses ranked lists with reciprocal rank fusion", () => {
    const fused = reciprocalRankFusion(
      [
        ["a", "b", "c"],
        ["b", "d", "a"],
        ["e", "b"],
      ],
      { k: 60, topN: 5 },
    );
    expect(fused[0].id).toBe("b");
    expect(fused[0].lists).toEqual([0, 1, 2]);
    expect(fused.find((h) => h.id === "a")!.score).toBeGreaterThan(
      fused.find((h) => h.id === "e")!.score,
    );
  });

  it("recovers paraphrase pairs via dense+RRF when match_key differs", () => {
    const docNew = randomUUID();
    const docOld = randomUUID();
    const newFactId = randomUUID();
    const paraFactId = randomUUID();
    const unrelatedId = randomUUID();

    for (const id of [docNew, docOld]) {
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

    // Different match_keys (would miss exact key path); similar claim semantics via dense.
    insertFact({
      id: newFactId,
      document_id: docNew,
      chunk_id: null,
      claim: "Total income from operations",
      raw_value: "8143",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
      entity: "Delhivery Limited",
      fact_type: "income",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|income|crore",
    });
    insertFact({
      id: paraFactId,
      document_id: docOld,
      chunk_id: null,
      claim: "Revenue from operations",
      raw_value: "8143",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
      entity: "Delhivery",
      fact_type: "revenue",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|revenue|crore",
    });
    insertFact({
      id: unrelatedId,
      document_id: docOld,
      chunk_id: null,
      claim: "Owned fleet count",
      raw_value: "5000",
      numeric_value: 5000,
      unit: "vehicles",
      period: "FY24",
      scope: null,
      entity: "Delhivery",
      fact_type: "fleet",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|fleet|vehicles",
    });

    const revenueDir = l2Normalize([1, 0.2, 0.05, 0]);
    const fleetDir = l2Normalize([0, 0, 1, 0.2]);
    upsertFactEmbedding({
      factId: newFactId,
      model,
      embedding: revenueDir,
      indexText: "Delhivery Limited | income | Total income from operations",
    });
    upsertFactEmbedding({
      factId: paraFactId,
      model,
      embedding: l2Normalize([0.98, 0.22, 0.04, 0.01]),
      indexText: "Delhivery | revenue | Revenue from operations",
    });
    upsertFactEmbedding({
      factId: unrelatedId,
      model,
      embedding: fleetDir,
      indexText: "Delhivery | fleet | Owned fleet count",
    });

    indexDocumentSparse(docNew);
    indexDocumentSparse(docOld);

    const newFact = {
      id: newFactId,
      document_id: docNew,
      chunk_id: null,
      claim: "Total income from operations",
      raw_value: "8143",
      numeric_value: 8143,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
      entity: "Delhivery Limited",
      fact_type: "income",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|income|crore",
      created_at: new Date().toISOString(),
    };

    const hits = hybridRetrieveForFact(newFact, {
      excludeDocumentId: docNew,
    });
    expect(hits.some((h) => h.factId === paraFactId)).toBe(true);
    const para = hits.find((h) => h.factId === paraFactId)!;
    expect(para.channels).toContain("dense");
    expect(para.score).toBeGreaterThan(
      hits.find((h) => h.factId === unrelatedId)?.score ?? 0,
    );

    const pairs = findCandidatePairs(docNew, 10);
    expect(pairs.some((p) => p.right.id === paraFactId)).toBe(true);
    expect(pairs[0].reason).toMatch(/^hybrid:/);
  });
});
