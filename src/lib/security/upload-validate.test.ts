import { describe, expect, it } from "vitest";
import {
  hasPdfMagicBytes,
  looksLikePdfFilename,
  sanitizeFilename,
} from "./upload-validate";
import { repairJsonText, parseJsonWithRepair } from "@/lib/llm/json-repair";
import { ExtractionResultSchema } from "@/lib/llm/schemas";
import { chunkPages } from "@/lib/pdf/chunk";

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

describe("chunking", () => {
  it("skips near-empty pages", () => {
    const chunks = chunkPages(
      [
        { pageNumber: 1, text: "x" },
        {
          pageNumber: 2,
          text: "Meaningful financial disclosure about capacity and utilization rates across network nodes.",
        },
        {
          pageNumber: 3,
          text: "Another page with enough characters to survive the filter and be grouped.",
        },
      ],
      2,
    );
    expect(chunks.length).toBe(1);
    expect(chunks[0].pageStart).toBe(2);
  });
});
