import { selectHighSignalPages } from "@/lib/pdf/signal";
import type { PdfPage } from "./types";

export type DocumentSection = {
  /** Best-effort heading; falls back to "Section starting p.N". */
  title: string;
  pageStart: number;
  pageEnd: number;
  text: string;
  /** 0-based index in the detected list. */
  index: number;
};

type LineRef = {
  pageNumber: number;
  text: string;
};

/** High-precision filing section titles (preferred over generic ALL CAPS). */
const KNOWN_SECTION_RE =
  /^(?:note\s+\d+[a-z]?[:.\s-]*)?(?:financial\s+highlights|key\s+performance\s+indicators|management\s+discussion\s+and\s+analysis|md\s*&\s*a|directors['’]?\s+report|corporate\s+governance|business\s+overview|our\s+business|risk\s+factors|summary\s+(?:of\s+)?financial(?:\s+information|\s+statements)?|consolidated\s+financial\s+statements|standalone\s+financial\s+statements|basis\s+of\s+preparation|significant\s+accounting\s+policies|revenue\s+from\s+operations|operating\s+expenses|related\s+party\s+transactions|capital\s+structure|objects\s+of\s+the\s+offer|definitions\s+and\s+abbreviations|prospectus\s+summary|general\s+information|industry\s+overview|our\s+management|history\s+and\s+certain\s+corporate|outstanding\s+litigation|government\s+and\s+other\s+approvals|other\s+regulatory\s+and\s+statutory|offer\s+structure|terms\s+of\s+the\s+offer)\b/i;

const NOTE_HEADING_RE =
  /^note\s+\d+[a-z]?(?:\s*[:.-]\s*|\s+)[A-Za-z].{2,80}$/i;

const NUMBERED_CHAPTER_RE =
  /^(?:section|chapter|part)\s+[A-Z0-9]+[:.\s-]+[A-Za-z].{2,80}$/i;

/** Multi-word ALL CAPS only (avoids CORPORATE / OFFICE / CONTACT false positives). */
const ALL_CAPS_MULTI_RE =
  /^[A-Z0-9][A-Z0-9’']*(?:\s+[A-Z0-9][A-Z0-9’'/-]*){2,10}$/;

const HEADING_KEYWORD_RE =
  /\b(highlights|overview|analysis|statements?|policies|governance|factors|operations|expenses|litigation|approvals|summary|information|management|performance|indicators|prospectus|revenue|ebitda)\b/i;

function normalizeLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Split page text into lines. Prefers embedded newlines (from parse EOL preservation);
 * falls back to light splits before known headings in space-joined blobs.
 */
export function linesFromPageText(text: string): string[] {
  const normalized = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.includes("\n")) {
    return normalized
      .split("\n")
      .map(normalizeLine)
      .filter(Boolean);
  }

  const soft = normalized
    .replace(
      /(?=(?:Note\s+\d+|Financial Highlights|Management Discussion|Consolidated Financial|Standalone Financial|Revenue from Operations|DIRECTORS[’']?\s+REPORT|CORPORATE GOVERNANCE|Risk Factors|Prospectus Summary))/gi,
      "\n",
    )
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
  return soft.length > 0 ? soft : normalized ? [normalized] : [];
}

/**
 * Heuristic: is this line a section heading for a finance filing?
 * Biased toward precision — false splits hurt parent/child more than merges.
 */
export function isSectionHeading(line: string): boolean {
  const t = normalizeLine(line);
  if (!t || t.length < 8 || t.length > 100) return false;
  if (/[.!?]{2,}$/.test(t)) return false;
  if ((t.match(/\d/g) || []).length > 6) return false;
  if (/^\d+([\d,.]\d+)*%?$/.test(t)) return false;
  // Address / contact noise
  if (/@|www\.|tel:|CIN:|GSTIN/i.test(t)) return false;

  if (KNOWN_SECTION_RE.test(t)) return true;
  if (NOTE_HEADING_RE.test(t)) return true;
  if (NUMBERED_CHAPTER_RE.test(t)) return true;

  const words = t.split(/\s+/);
  if (
    ALL_CAPS_MULTI_RE.test(t) &&
    words.length >= 3 &&
    words.length <= 10 &&
    HEADING_KEYWORD_RE.test(t) &&
    !/\d{5,}/.test(t)
  ) {
    return true;
  }

  // Title Case only when it also looks like a known filing topic.
  if (
    words.length >= 2 &&
    words.length <= 8 &&
    !/[.!?]$/.test(t) &&
    HEADING_KEYWORD_RE.test(t) &&
    /^[A-Z]/.test(t) &&
    KNOWN_SECTION_RE.test(t)
  ) {
    return true;
  }

  return false;
}

function collectLines(pages: PdfPage[]): LineRef[] {
  const lines: LineRef[] = [];
  for (const page of pages) {
    for (const line of linesFromPageText(page.text || "")) {
      lines.push({ pageNumber: page.pageNumber, text: line });
    }
  }
  return lines;
}

/**
 * Detect ordered section spans on the given pages (call after signal select).
 * Does not emit DB chunks yet — Step 2 inspect/API only.
 */
export function detectSections(pages: PdfPage[]): DocumentSection[] {
  if (!pages.length) return [];

  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const lines = collectLines(ordered);
  if (lines.length === 0) {
    return [
      {
        title: `Section starting p.${ordered[0].pageNumber}`,
        pageStart: ordered[0].pageNumber,
        pageEnd: ordered[ordered.length - 1].pageNumber,
        text: ordered.map((p) => p.text).join("\n\n"),
        index: 0,
      },
    ];
  }

  type Boundary = { lineIndex: number; title: string };
  const boundaries: Boundary[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (isSectionHeading(lines[i].text)) {
      boundaries.push({ lineIndex: i, title: lines[i].text });
    }
  }

  // No headings found — one section covering all pages.
  if (boundaries.length === 0) {
    return [
      {
        title: `Section starting p.${ordered[0].pageNumber}`,
        pageStart: ordered[0].pageNumber,
        pageEnd: ordered[ordered.length - 1].pageNumber,
        text: ordered.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n"),
        index: 0,
      },
    ];
  }

  // Ensure we capture preamble before the first heading.
  if (boundaries[0].lineIndex > 0) {
    boundaries.unshift({
      lineIndex: 0,
      title: `Preamble (before ${boundaries[0].title})`,
    });
  }

  const sections: DocumentSection[] = [];
  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b].lineIndex;
    const end =
      b + 1 < boundaries.length ? boundaries[b + 1].lineIndex : lines.length;
    const slice = lines.slice(start, end);
    if (slice.length === 0) continue;

    // Skip the heading line itself from body duplication when title is the heading.
    const bodyLines =
      boundaries[b].title.startsWith("Preamble")
        ? slice
        : slice[0]?.text === boundaries[b].title
          ? slice
          : slice;

    const text = bodyLines.map((l) => l.text).join("\n");
    if (!text.trim()) continue;

    sections.push({
      title: boundaries[b].title.slice(0, 160),
      pageStart: slice[0].pageNumber,
      pageEnd: slice[slice.length - 1].pageNumber,
      text,
      index: sections.length,
    });
  }

  return sections;
}

/**
 * Signal-select pages, then detect sections — primary Step 2 entrypoint.
 */
export function detectSectionsFromDocument(pages: PdfPage[]): DocumentSection[] {
  const selected = selectHighSignalPages(pages);
  const basis = selected.length > 0 ? selected : pages;
  return detectSections(basis);
}

export function summarizeSections(sections: DocumentSection[]): string {
  if (sections.length === 0) return "0 sections";
  const titles = sections
    .slice(0, 5)
    .map((s) => `"${s.title.slice(0, 40)}" p.${s.pageStart}-${s.pageEnd}`)
    .join("; ");
  const more = sections.length > 5 ? ` (+${sections.length - 5} more)` : "";
  return `${sections.length} sections: ${titles}${more}`;
}
