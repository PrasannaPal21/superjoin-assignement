import { describe, expect, it } from "vitest";
import {
  hasPdfMagicBytes,
  looksLikePdfFilename,
  sanitizeFilename,
} from "./upload-validate";
import { repairJsonText, parseJsonWithRepair } from "@/lib/llm/json-repair";
import { ExtractionResultSchema } from "@/lib/llm/schemas";
import {
  applyPageSignals,
  explainPageSignal,
  scorePageSignal,
  selectHighSignalPages,
} from "@/lib/pdf/signal";
import {
  buildChunkHierarchy,
  flattenHierarchyChildren,
} from "@/lib/pdf/hierarchy";
import {
  detectSections,
  isSectionHeading,
  linesFromPageText,
} from "@/lib/pdf/structure";
import { childChunksFromParent } from "@/lib/pdf/children";
import { parentChunksFromBlocks } from "@/lib/pdf/parents";
import { selectExtractChildren } from "@/lib/pdf/select-extract";
import {
  detectBlocksFromSections,
  isTableLine,
  tableLineScore,
} from "@/lib/pdf/tables";
import {
  buildEvidenceIndexText,
  buildFactCard,
  buildFactCardCompact,
  tokenizeIndexText,
} from "@/lib/embeddings/index-text";
import { cosineSimilarity, l2Normalize } from "@/lib/embeddings/client";
import {
  getEmbeddingModel,
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

describe("embedding client helpers (step 2)", () => {
  it("defaults to free local MiniLM model", () => {
    expect(getEmbeddingModel()).toContain("MiniLM");
  });

  it("L2-normalizes and supports cosine via dot product", () => {
    const n = l2Normalize([3, 4]);
    expect(Math.hypot(...n)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(n, n)).toBeCloseTo(1, 5);
  });
});

describe("index text builders (embeddings step 1)", () => {
  it("builds a stable fact card from camelCase or snake_case fields", () => {
    const card = buildFactCard({
      entity: "Delhivery Limited",
      factType: "revenue",
      claim: "Revenue from operations",
      rawValue: "8143",
      unit: "crore",
      period: "FY24",
      scope: "consolidated",
    });
    expect(card).toBe(
      "Delhivery Limited | revenue | Revenue from operations | 8143 | crore | FY24 | consolidated",
    );

    const fromRow = buildFactCard({
      entity: "Delhivery",
      fact_type: "ebitda",
      claim: "EBITDA",
      raw_value: "312",
      unit: "crore",
      period: "FY24",
      scope: null,
    });
    expect(fromRow).toContain("ebitda");
    expect(fromRow).toContain("312");
    expect(fromRow.endsWith("|")).toBe(false);
  });

  it("falls back to numericValue when rawValue is missing", () => {
    expect(
      buildFactCard({
        claim: "PAT",
        factType: "pat",
        numericValue: 140.5,
        unit: "crore",
      }),
    ).toContain("140.5");
  });

  it("builds compact cards without empty slots", () => {
    expect(
      buildFactCardCompact({
        claim: "Pin code coverage",
        factType: "coverage",
        rawValue: "18000",
      }),
    ).toBe("coverage | Pin code coverage | 18000");
  });

  it("builds evidence index text with page + quote", () => {
    expect(
      buildEvidenceIndexText({
        page: 12,
        quote: "  Revenue from operations was ₹ 8,143 crore  ",
      }),
    ).toBe("page=12 | Revenue from operations was ₹ 8,143 crore");

    expect(
      buildEvidenceIndexText({ page: null, quote: "No page known" }),
    ).toBe("page=? | No page known");
  });

  it("tokenizes index text for sparse retrieval", () => {
    const tokens = tokenizeIndexText(
      "Delhivery | revenue | Revenue from operations | 8143 | crore | FY24",
    );
    expect(tokens).toContain("delhivery");
    expect(tokens).toContain("revenue");
    expect(tokens).toContain("operations");
    expect(tokens).toContain("crore");
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

describe("extract child selection (step 6)", () => {
  it("keeps highest-signal children within MAX_EXTRACT_CHUNKS budget", () => {
    const parent = {
      pageStart: 1,
      pageEnd: 1,
      text: "parent",
      tokenEstimate: 10,
      signalScore: 1,
      kind: "parent" as const,
      sectionTitle: "Financial Highlights",
      blockKind: "narrative" as const,
    };
    const jobs = [
      {
        childId: "low",
        parent,
        child: {
          ...parent,
          kind: "child" as const,
          parentId: "p",
          text: "low signal prose",
          signalScore: 0.5,
          blockKind: "narrative" as const,
        },
      },
      {
        childId: "high-table",
        parent,
        child: {
          ...parent,
          kind: "child" as const,
          parentId: "p",
          text: "Particulars FY24\nRevenue 100",
          signalScore: 2,
          blockKind: "table" as const,
        },
      },
      {
        childId: "mid",
        parent,
        child: {
          ...parent,
          kind: "child" as const,
          parentId: "p",
          text: "mid signal",
          signalScore: 1.2,
          blockKind: "narrative" as const,
        },
      },
    ];
    const selected = selectExtractChildren(jobs, 2);
    expect(selected).toHaveLength(2);
    expect(selected[0].childId).toBe("high-table");
    expect(selected.map((j) => j.childId)).not.toContain("low");
  });
});

describe("hierarchy chunking (step 7 default)", () => {
  it("builds parent/child hierarchy and skips TOC-only signal pages", () => {
    const pages = [
      { pageNumber: 1, text: "Table of contents ............ 1" },
      {
        pageNumber: 2,
        text: [
          "Financial Highlights",
          "Revenue from operations was ₹ 4,815.04 crore in Fiscal 2021 with capacity utilization at 72%.",
          "Particulars  FY23  FY24",
          "Revenue from operations  3,000.00  4,815.04",
          "EBITDA  250.50  312.00",
        ].join("\n"),
      },
    ];
    const hierarchy = buildChunkHierarchy(pages);
    expect(hierarchy.nodes.length).toBeGreaterThanOrEqual(1);
    expect(hierarchy.nodes.every((n) => n.parent.kind === "parent")).toBe(true);

    const children = flattenHierarchyChildren(hierarchy);
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(children.every((c) => c.kind === "child")).toBe(true);
    expect(children.every((c) => typeof c.parentId === "string")).toBe(true);
    expect(children.some((c) => /Revenue|EBITDA/i.test(c.text))).toBe(true);
  });
});
