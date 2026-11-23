import { describe, expect, it } from "vitest";
import {
  hasPdfMagicBytes,
  looksLikePdfFilename,
  sanitizeFilename,
} from "./upload-validate";
import { repairJsonText, parseJsonWithRepair } from "@/lib/llm/json-repair";
import { ExtractionResultSchema } from "@/lib/llm/schemas";
import { chunkPages } from "@/lib/pdf/chunk";
import {
  applyPageSignals,
  explainPageSignal,
  scorePageSignal,
  selectHighSignalPages,
} from "@/lib/pdf/signal";
import {
  getOcrMinTextChars,
  isOcrEnabled,
} from "@/lib/config";

describe("upload validation", () => {
  it("sanitizes path-like names", () => {
    expect(sanitizeFilename("../../evil.pdf")).toBe("evil.pdf");
  });

  it("checks pdf extension", () => {
    expect(looksLikePdfFilename("a.pdf")).toBe(true);
    expect(looksLikePdfFilename("a.txt")).toBe(false);
  });

  it("checks magic bytes", () => {
    expect(hasPdfMagicBytes(Buffer.from("%PDF-1.7 ..."))).toBe(true);
    expect(hasPdfMagicBytes(Buffer.from("not a pdf"))).toBe(false);
  });
});

describe("json repair", () => {
  it("unwraps fenced json", () => {
    const raw = '```json\n{"facts":[],"notes":null}\n```';
    expect(parseJsonWithRepair(raw)).toEqual({ facts: [], notes: null });
  });

  it("strips trailing commas", () => {
    const repaired = repairJsonText('{"facts":[],}');
    expect(JSON.parse(repaired)).toEqual({ facts: [] });
  });
});

describe("fact schema", () => {
  it("accepts a minimal fact payload", () => {
    const parsed = ExtractionResultSchema.parse({
      facts: [
        {
          claim: "Revenue was 100",
          evidenceQuote: "Revenue was 100",
          factType: "revenue",
          confidence: 0.8,
        },
      ],
    });
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.facts[0].factType).toBe("revenue");
  });
});

describe("ocr config", () => {
  it("defaults OCR on with a sensible sparse threshold", () => {
    expect(isOcrEnabled()).toBe(true);
    expect(getOcrMinTextChars()).toBeGreaterThan(0);
  });
});

describe("signal scoring", () => {
  it("scores TOC/filler low and KPI pages high", () => {
    const toc = scorePageSignal("Table of contents ............ 1 ........ 2");
    const kpi = scorePageSignal(
      "Revenue from operations was ₹ 4,815.04 crore in Fiscal 2021. EBITDA margin and PAT grew YoY.",
    );
    expect(toc).toBeLessThan(0.8);
    expect(kpi).toBeGreaterThanOrEqual(0.8);
    expect(explainPageSignal("Glossary of terms …").lowSignal).toBe(true);
  });

  it("selects high-signal pages in reading order", () => {
    const pages = applyPageSignals([
      { pageNumber: 1, text: "Table of contents ............ 1" },
      {
        pageNumber: 2,
        text: "Revenue from operations was ₹ 4,815.04 crore in Fiscal 2021 with capacity utilization at 72%.",
      },
      {
        pageNumber: 3,
        text: "EBITDA stood at ₹ 312 crore for FY24. Shipments and pin code coverage expanded.",
      },
    ]);
    const selected = selectHighSignalPages(pages);
    expect(selected.every((p) => (p.signalScore ?? 0) >= 0.8)).toBe(true);
    expect(selected.map((p) => p.pageNumber)).toEqual(
      [...selected.map((p) => p.pageNumber)].sort((a, b) => a - b),
    );
    expect(selected.some((p) => p.pageNumber === 1)).toBe(false);
  });
});

describe("chunking", () => {
  it("packs signal-rich pages and skips fluff", () => {
    const pages = applyPageSignals([
      { pageNumber: 1, text: "Table of contents ............ 1" },
      {
        pageNumber: 2,
        text: "Revenue from operations was ₹ 4,815.04 crore in Fiscal 2021 with capacity utilization at 72%.",
      },
      {
        pageNumber: 3,
        text: "EBITDA stood at ₹ 312 crore for FY24. Shipments and pin code coverage expanded.",
      },
    ]);
    const chunks = chunkPages(pages, 2);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].pageStart).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.text.includes("Revenue"))).toBe(true);
  });

  it("step 1: packed chunks carry hierarchy fields with flat defaults", () => {
    const pages = applyPageSignals([
      {
        pageNumber: 2,
        text: "Revenue from operations was ₹ 4,815.04 crore in Fiscal 2021 with capacity utilization at 72%.",
      },
    ]);
    const chunks = chunkPages(pages, 2);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const c of chunks) {
      expect(c.kind).toBe("flat");
      expect(c.parentId ?? null).toBeNull();
      expect(c.sectionTitle ?? null).toBeNull();
    }
  });
});
