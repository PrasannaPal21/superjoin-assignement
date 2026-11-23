import type { PdfPage } from "@/lib/pdf/types";
import type { DocumentSection } from "@/lib/pdf/structure";
import {
  detectSectionsFromDocument,
  linesFromPageText,
} from "@/lib/pdf/structure";

export type BlockKind = "narrative" | "table";

export type DocumentBlock = {
  kind: BlockKind;
  /** Parent section title (from Step 2). */
  sectionTitle: string;
  sectionIndex: number;
  pageStart: number;
  pageEnd: number;
  text: string;
  /** Global block index across the document. */
  index: number;
};

const TABLE_HEADER_RE =
  /\b(particulars|as\s+at|for\s+the\s+(?:year|period|nine\s+months)|year\s+ended|fy\s?\d{2}|march\s+31|december\s+31|amount|total|₹|rs\.?|inr)\b/i;

const NUMBER_TOKEN_RE =
  /(?:₹|rs\.?\s*)?-?\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|-?\d+\.\d+%?|-?\d{4,}(?:\.\d+)?/gi;

function normalizeLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function countNumberTokens(line: string): number {
  return (line.match(NUMBER_TOKEN_RE) || []).length;
}

function digitRatio(line: string): number {
  if (!line.length) return 0;
  const digits = (line.match(/\d/g) || []).length;
  return digits / line.length;
}

/**
 * Score how table-like a single line is (0–1+).
 * Used to label lines before grouping into blocks.
 */
export function tableLineScore(line: string): number {
  const t = normalizeLine(line);
  if (!t || t.length < 3) return 0;

  const nums = countNumberTokens(t);
  const ratio = digitRatio(t);
  let score = 0;

  if (nums >= 3) score += 1.2;
  else if (nums === 2) score += 0.7;
  else if (nums === 1 && ratio > 0.15) score += 0.35;

  if (TABLE_HEADER_RE.test(t) && (nums >= 1 || /\b(particulars|as\s+at)\b/i.test(t))) {
    score += 0.8;
  }

  // Multi-column feel: several wide gaps or pipe separators.
  if ((t.match(/\s{2,}|\t|\|/g) || []).length >= 2 && nums >= 1) {
    score += 0.4;
  }

  // Pure narrative sentences with one year mention stay low.
  if (/[.!?]$/.test(t) && nums <= 1 && t.split(/\s+/).length > 12) {
    score *= 0.25;
  }

  return score;
}

export function isTableLine(line: string, threshold = 0.65): boolean {
  return tableLineScore(line) >= threshold;
}

type ScoredLine = {
  text: string;
  pageNumber: number;
  isTable: boolean;
};

/**
 * Label each line in a section as table vs narrative, then merge consecutive runs.
 * Tiny narrative gaps (1 line) inside a table run are absorbed into the table.
 */
export function detectBlocksInSection(
  section: DocumentSection,
  startIndex = 0,
): DocumentBlock[] {
  const rawLines = linesFromPageText(section.text);
  if (rawLines.length === 0) {
    return [
      {
        kind: "narrative",
        sectionTitle: section.title,
        sectionIndex: section.index,
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
        text: section.text,
        index: startIndex,
      },
    ];
  }

  // Page attribution: section text may span pages; assign by proportional split
  // when newlines don't carry page markers. Prefer pageStart for short sections.
  const scored: ScoredLine[] = rawLines.map((text, i) => {
    const pageNumber =
      section.pageStart === section.pageEnd
        ? section.pageStart
        : section.pageStart +
          Math.floor(
            (i / Math.max(1, rawLines.length - 1)) *
              (section.pageEnd - section.pageStart),
          );
    return {
      text,
      pageNumber,
      isTable: isTableLine(text),
    };
  });

  // Absorb single narrative lines sandwiched between table lines.
  for (let i = 1; i < scored.length - 1; i++) {
    if (
      !scored[i].isTable &&
      scored[i - 1].isTable &&
      scored[i + 1].isTable &&
      countNumberTokens(scored[i].text) >= 1
    ) {
      scored[i].isTable = true;
    }
  }

  const blocks: DocumentBlock[] = [];
  let i = 0;
  while (i < scored.length) {
    const kind: BlockKind = scored[i].isTable ? "table" : "narrative";
    let j = i + 1;
    while (j < scored.length && scored[j].isTable === scored[i].isTable) {
      j += 1;
    }

    // Drop ultra-short "table" blips (1 weak line) — treat as narrative.
    const slice = scored.slice(i, j);
    let finalKind = kind;
    if (kind === "table" && slice.length === 1 && tableLineScore(slice[0].text) < 1.0) {
      finalKind = "narrative";
    }

    // Merge into previous narrative if we demoted a blip.
    if (
      finalKind === "narrative" &&
      blocks.length > 0 &&
      blocks[blocks.length - 1].kind === "narrative" &&
      kind === "table" &&
      slice.length === 1
    ) {
      const prev = blocks[blocks.length - 1];
      prev.text = `${prev.text}\n${slice.map((s) => s.text).join("\n")}`.trim();
      prev.pageEnd = slice[slice.length - 1].pageNumber;
      i = j;
      continue;
    }

    blocks.push({
      kind: finalKind,
      sectionTitle: section.title,
      sectionIndex: section.index,
      pageStart: slice[0].pageNumber,
      pageEnd: slice[slice.length - 1].pageNumber,
      text: slice.map((s) => s.text).join("\n"),
      index: startIndex + blocks.length,
    });
    i = j;
  }

  return blocks;
}

/**
 * Run table/narrative segmentation across all sections.
 */
export function detectBlocksFromSections(
  sections: DocumentSection[],
): DocumentBlock[] {
  const out: DocumentBlock[] = [];
  for (const section of sections) {
    const blocks = detectBlocksInSection(section, out.length);
    out.push(...blocks);
  }
  // Re-index globally after push (detectBlocksInSection already used startIndex).
  return out.map((b, index) => ({ ...b, index }));
}

export function summarizeBlocks(blocks: DocumentBlock[]): string {
  const tables = blocks.filter((b) => b.kind === "table").length;
  const narratives = blocks.filter((b) => b.kind === "narrative").length;
  if (blocks.length === 0) return "0 blocks";
  return `${blocks.length} blocks (${tables} table, ${narratives} narrative)`;
}

/** Step 2+3 entrypoint: signal → sections → table/narrative blocks. */
export function detectBlocksFromDocument(pages: PdfPage[]): {
  sections: DocumentSection[];
  blocks: DocumentBlock[];
} {
  const sections = detectSectionsFromDocument(pages);
  const blocks = detectBlocksFromSections(sections);
  return { sections, blocks };
}
