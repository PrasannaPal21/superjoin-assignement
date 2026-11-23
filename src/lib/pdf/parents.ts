import { getChunkCharBudget } from "@/lib/config";
import type { TextChunk } from "@/lib/pdf/chunk";
import { scorePageSignal } from "@/lib/pdf/signal";
import type { DocumentBlock } from "@/lib/pdf/tables";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function capParentText(text: string): string {
  const budget = getChunkCharBudget() + 4000; // parents may be larger context packs
  if (text.length <= budget) return text;
  return `${text.slice(0, budget)}\n…[truncated]`;
}

/**
 * Step 4: turn table/narrative blocks into parent TextChunks (context units).
 * Does not create children yet — extract still uses flat packs until steps 5–6.
 */
export function parentChunksFromBlocks(blocks: DocumentBlock[]): TextChunk[] {
  return blocks
    .filter((b) => (b.text || "").trim().length > 0)
    .map((b) => {
      const text = capParentText(b.text.trim());
      return {
        pageStart: b.pageStart,
        pageEnd: b.pageEnd,
        text,
        tokenEstimate: estimateTokens(text),
        signalScore: scorePageSignal(text),
        kind: "parent" as const,
        parentId: null,
        sectionTitle: b.sectionTitle.slice(0, 200),
        blockKind: b.kind,
      };
    });
}
