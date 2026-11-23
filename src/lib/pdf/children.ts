import {
  getChildMaxTokens,
  getChildMinTokens,
  getChildTableRows,
} from "@/lib/config";
import type { TextChunk } from "@/lib/pdf/chunk";
import { scorePageSignal } from "@/lib/pdf/signal";
import { isTableLine } from "@/lib/pdf/tables";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function makeChild(
  parent: TextChunk,
  parentId: string,
  text: string,
): TextChunk {
  const trimmed = text.trim();
  return {
    pageStart: parent.pageStart,
    pageEnd: parent.pageEnd,
    text: trimmed,
    tokenEstimate: estimateTokens(trimmed),
    signalScore: scorePageSignal(trimmed),
    kind: "child",
    parentId,
    sectionTitle: parent.sectionTitle ?? null,
    blockKind: parent.blockKind ?? null,
  };
}

const TABLE_HEADER_HINT =
  /\b(particulars|as\s+at|for\s+the\s+(?:year|period)|fy\s?\d{2}|march\s+31|december\s+31|amount|₹|rs\.?)\b/i;

function splitNarrativeUnits(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  // Prefer paragraph breaks; else sentence-ish splits.
  let parts = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 1) {
    parts = raw
      .split(/\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  if (parts.length === 1 && estimateTokens(parts[0]) > getChildMaxTokens()) {
    parts = raw
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  return parts.length > 0 ? parts : [raw];
}

/**
 * Pack narrative units into ~min–max token children.
 */
function childChunksFromNarrative(
  parent: TextChunk,
  parentId: string,
): TextChunk[] {
  const units = splitNarrativeUnits(parent.text);
  const minTok = getChildMinTokens();
  const maxTok = getChildMaxTokens();
  const children: TextChunk[] = [];

  let buf: string[] = [];
  let bufTok = 0;

  const flush = () => {
    if (buf.length === 0) return;
    children.push(makeChild(parent, parentId, buf.join("\n\n")));
    buf = [];
    bufTok = 0;
  };

  for (const unit of units) {
    const t = estimateTokens(unit);
    if (buf.length > 0 && bufTok + t > maxTok && bufTok >= minTok) {
      flush();
    }
    // Oversized single unit: hard-split by characters approximating tokens.
    if (t > maxTok * 1.5) {
      flush();
      const approxChars = maxTok * 4;
      for (let i = 0; i < unit.length; i += approxChars) {
        children.push(makeChild(parent, parentId, unit.slice(i, i + approxChars)));
      }
      continue;
    }
    buf.push(unit);
    bufTok += t;
    if (bufTok >= maxTok) flush();
  }
  flush();

  return children.length > 0 ? children : [makeChild(parent, parentId, parent.text)];
}

function extractTableHeader(lines: string[]): { header: string[]; rows: string[] } {
  if (lines.length === 0) return { header: [], rows: [] };

  const header: string[] = [];
  let i = 0;
  // Leading lines that look like column headers (Particulars / As at / FY…).
  while (i < Math.min(3, lines.length) && TABLE_HEADER_HINT.test(lines[i])) {
    header.push(lines[i]);
    i += 1;
  }

  // Fallback: first line if it isn't a dense numeric data row.
  if (header.length === 0 && lines.length > 1 && !isTableLine(lines[0], 1.0)) {
    header.push(lines[0]);
    i = 1;
  }

  return { header, rows: lines.slice(i) };
}

/**
 * Table children: repeat header with row groups so label + periods + values stay together.
 */
function childChunksFromTable(parent: TextChunk, parentId: string): TextChunk[] {
  const lines = parent.text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [makeChild(parent, parentId, parent.text)];
  }

  const { header, rows } = extractTableHeader(lines);
  const rowGroup = Math.max(1, getChildTableRows());
  const children: TextChunk[] = [];

  if (rows.length === 0) {
    return [makeChild(parent, parentId, [...header, ...lines].join("\n"))];
  }

  for (let i = 0; i < rows.length; i += rowGroup) {
    const group = rows.slice(i, i + rowGroup);
    const text = [...header, ...group].join("\n");
    children.push(makeChild(parent, parentId, text));
  }

  return children;
}

/**
 * Step 5: split a persisted parent into child extract units linked by parentId.
 */
export function childChunksFromParent(
  parent: TextChunk,
  parentId: string,
): TextChunk[] {
  if (!parent.text?.trim()) return [];

  if (parent.blockKind === "table") {
    return childChunksFromTable(parent, parentId);
  }
  return childChunksFromNarrative(parent, parentId);
}
