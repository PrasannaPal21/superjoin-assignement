import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";
import { ensureDb } from "@/lib/db";
import { closeDb, getDbPath } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import {
  getEvidenceEmbedding,
  getFactEmbedding,
  upsertFactEmbedding,
} from "@/lib/db/embeddings";
import { insertEvidence, insertFact } from "@/lib/db/facts";
import { l2Normalize } from "@/lib/embeddings/client";
import {
  indexDocumentEmbeddings,
  needsEmbedding,
} from "@/lib/embeddings/index-document";

vi.mock("@/lib/embeddings/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embeddings/client")>();
  return {
    ...actual,
    embedTexts: vi.fn(async (texts: string[]) => ({
      vectors: texts.map((_, i) =>
        l2Normalize([0.1 + i * 0.01, 0.2, 0.3, 0.4]),
      ),
      model: "Xenova/all-MiniLM-L6-v2",
      dimensions: 4,
      provider: "local" as const,
    })),
    isEmbeddingsConfigured: () => true,
  };
});

describe("index on ingest (embeddings step 4)", () => {
  const prevDb = process.env.DATABASE_PATH;
  const prevModel = process.env.EMBEDDING_MODEL;
  const testDb = "data/test-index-document.db";

  beforeAll(() => {
    process.env.DATABASE_PATH = testDb;
    process.env.EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
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

  it("needsEmbedding skips same model and re-embeds on bump", () => {
    expect(needsEmbedding(null, "m1")).toBe(true);
    expect(needsEmbedding({ model: "m1" }, "m1")).toBe(false);
    expect(needsEmbedding({ model: "m1" }, "m2")).toBe(true);
    expect(needsEmbedding({ model: "m1" }, "m1", true)).toBe(true);
  });

  it("embeds facts + evidence for a document and skips on re-run", async () => {
    expect(getDbPath()).toContain("test-index-document");
    const docId = randomUUID();
    const factId = randomUUID();
    const evidenceId = randomUUID();

    insertDocument({
      id: docId,
      original_filename: "t.pdf",
      stored_path: "data/uploads/t.pdf",
      mime_type: "application/pdf",
      byte_size: 1,
      content_hash: randomUUID(),
      status: "ready",
    });
    insertFact({
      id: factId,
      document_id: docId,
      chunk_id: null,
      claim: "Revenue from operations",
      raw_value: "100",
      numeric_value: 100,
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
      entity: "Delhivery",
      fact_type: "revenue",
      confidence: 0.9,
      status: "active",
      match_key: "delhivery|revenue|crore",
    });
    insertEvidence({
      id: evidenceId,
      fact_id: factId,
      document_id: docId,
      page: 2,
      quote: "Revenue from operations was 100 crore",
    });

    const first = await indexDocumentEmbeddings(docId);
    expect(first.factsIndexed).toBe(1);
    expect(first.evidenceIndexed).toBe(1);
    expect(first.factsSkipped).toBe(0);

    const factEmb = getFactEmbedding(factId);
    expect(factEmb?.model).toContain("MiniLM");
    expect(factEmb?.index_text).toContain("Revenue from operations");
    expect(factEmb?.dimensions).toBe(4);

    const evEmb = getEvidenceEmbedding(evidenceId);
    expect(evEmb?.index_text).toContain("page=2");
    expect(evEmb?.embedding.length).toBe(4);

    const second = await indexDocumentEmbeddings(docId);
    expect(second.factsIndexed).toBe(0);
    expect(second.evidenceIndexed).toBe(0);
    expect(second.factsSkipped).toBe(1);
    expect(second.evidenceSkipped).toBe(1);

    upsertFactEmbedding({
      factId,
      model: "old-model",
      embedding: [1, 0, 0, 0],
      indexText: "stale",
    });
    const third = await indexDocumentEmbeddings(docId);
    expect(third.factsIndexed).toBe(1);
    expect(getFactEmbedding(factId)?.model).toContain("MiniLM");
  });
});
