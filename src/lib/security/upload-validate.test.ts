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
  detectSections,
  isSectionHeading,
  linesFromPageText,
} from "@/lib/pdf/structure";
import { childChunksFromParent } from "@/lib/pdf/children";
import { parentChunksFromBlocks } from "@/lib/pdf/parents";
import {
  detectBlocksFromSections,
  isTableLine,
  tableLineScore,
} from "@/lib/pdf/tables";
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

describe("structure detection (step 2)", () => {
  it("recognizes common finance headings", () => {
    expect(isSectionHeading("Financial Highlights")).toBe(true);
    expect(isSectionHeading("Note 2: Revenue from operations")).toBe(true);
    expect(isSectionHeading("MANAGEMENT DISCUSSION AND ANALYSIS")).toBe(true);
    expect(
      isSectionHeading(
        "Revenue was ₹ 100 crore in FY24 with strong EBITDA margins across segments.",
      ),
    ).toBe(false);
  });

  it("splits pages into sections on heading boundaries", () => {
    const pages = applyPageSignals([
      {
        pageNumber: 1,
        text: "Table of contents ............ 1",
      },
      {
        pageNumber: 2,
        text: [
          "Financial Highlights",
          "Revenue from operations was ₹ 4,815.04 crore in Fiscal 2021.",
          "EBITDA stood at ₹ 312 crore.",
        ].join("\n"),
      },
      {
        pageNumber: 3,
        text: [
          "Risk Factors",
          "We face competitive pressure in logistics markets.",
        ].join("\n"),
      },
    ]);
    const sections = detectSections(selectHighSignalPages(pages));
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections.some((s) => /financial highlights/i.test(s.title))).toBe(
      true,
    );
    expect(sections.some((s) => /risk factors/i.test(s.title))).toBe(true);
  });

  it("linesFromPageText prefers embedded newlines", () => {
    expect(linesFromPageText("A\nB\nC")).toEqual(["A", "B", "C"]);
  });
});

describe("table block detection (step 3)", () => {
  it("scores numeric table rows higher than prose", () => {
    const prose =
      "We continue to invest in capacity and technology across our network over the long term.";
    const row =
      "Revenue from operations  4,815.04  3,814.23  2,901.11";
    const header = "Particulars  As at March 31, 2024  As at March 31, 2023";
    expect(tableLineScore(row)).toBeGreaterThan(tableLineScore(prose));
    expect(isTableLine(row)).toBe(true);
    expect(isTableLine(header)).toBe(true);
    expect(isTableLine(prose)).toBe(false);
  });

  it("splits a section into narrative and table blocks", () => {
    const sections = detectSections([
      {
        pageNumber: 2,
        text: [
          "Financial Highlights",
          "The following discussion should be read with our financials.",
          "Particulars  FY23  FY24",
          "Revenue from operations  3,000.00  4,815.04",
          "EBITDA  250.50  312.00",
          "Management believes margins will remain resilient.",
        ].join("\n"),
        signalScore: 5,
      },
    ]);
    const blocks = detectBlocksFromSections(sections);
    expect(blocks.some((b) => b.kind === "table")).toBe(true);
    expect(blocks.some((b) => b.kind === "narrative")).toBe(true);
    const table = blocks.find((b) => b.kind === "table");
    expect(table?.text).toMatch(/Revenue from operations/);
    expect(table?.text).toMatch(/EBITDA/);
  });
});

describe("parent chunks (step 4)", () => {
  it("emits kind=parent chunks from table/narrative blocks", () => {
    const sections = detectSections([
      {
        pageNumber: 2,
        text: [
          "Financial Highlights",
          "Intro prose for the highlights section.",
          "Particulars  FY23  FY24",
          "Revenue from operations  3,000.00  4,815.04",
        ].join("\n"),
        signalScore: 5,
      },
    ]);
    const blocks = detectBlocksFromSections(sections);
    const parents = parentChunksFromBlocks(blocks);
    expect(parents.length).toBeGreaterThanOrEqual(1);
    expect(parents.every((p) => p.kind === "parent")).toBe(true);
    expect(parents.every((p) => p.parentId == null)).toBe(true);
    expect(parents.some((p) => p.blockKind === "table")).toBe(true);
    expect(parents.some((p) => /financial highlights/i.test(p.sectionTitle || ""))).toBe(
      true,
    );
  });
});

describe("child chunks (step 5)", () => {
  it("links narrative children to parentId and respects size packing", () => {
    const parent = {
      pageStart: 1,
      pageEnd: 1,
      text: [
        "First paragraph about capacity utilization and network expansion in FY24.",
        "",
        "Second paragraph covering revenue from operations and EBITDA trajectory.",
        "",
        "Third paragraph on shipments, pin code coverage, and operating leverage.",
      ].join("\n"),
      tokenEstimate: 200,
      signalScore: 3,
      kind: "parent" as const,
      parentId: null,
      sectionTitle: "Financial Highlights",
      blockKind: "narrative" as const,
    };
    const children = childChunksFromParent(parent, "parent-1");
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(children.every((c) => c.kind === "child")).toBe(true);
    expect(children.every((c) => c.parentId === "parent-1")).toBe(true);
  });

  it("keeps table header with each row group", () => {
    const parent = {
      pageStart: 2,
      pageEnd: 2,
      text: [
        "Particulars  FY23  FY24",
        "Revenue from operations  3,000.00  4,815.04",
        "EBITDA  250.50  312.00",
        "PAT  100.00  140.00",
        "Cash from operations  180.00  210.00",
        "Capex  90.00  110.00",
        "Net debt  50.00  40.00",
      ].join("\n"),
      tokenEstimate: 120,
      signalScore: 5,
      kind: "parent" as const,
      sectionTitle: "Financial Highlights",
      blockKind: "table" as const,
    };
    const children = childChunksFromParent(parent, "parent-table");
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(children.every((c) => c.parentId === "parent-table")).toBe(true);
    expect(children.every((c) => /Particulars/.test(c.text))).toBe(true);
    expect(children.some((c) => /Revenue from operations/.test(c.text))).toBe(
      true,
    );
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
