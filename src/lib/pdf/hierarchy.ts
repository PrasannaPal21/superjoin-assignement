import { childChunksFromParent } from "@/lib/pdf/children";
import type { TextChunk } from "@/lib/pdf/chunk";
import { parentChunksFromBlocks } from "@/lib/pdf/parents";
import { applyPageSignals } from "@/lib/pdf/signal";
import {
  detectBlocksFromDocument,
  type DocumentBlock,
} from "@/lib/pdf/tables";
import type { DocumentSection } from "@/lib/pdf/structure";
import type { PdfPage } from "./types";

export type HierarchyNode = {
  parent: TextChunk;
  /** Children with temporary parentId (`pending:${index}`) until DB persist. */
  children: TextChunk[];
};

export type ChunkHierarchy = {
  sections: DocumentSection[];
  blocks: DocumentBlock[];
  nodes: HierarchyNode[];
};

/**
 * Full structure-aware chunking path (step 7 default):
 * signal → sections → table/narrative blocks → parents → children.
 */
export function buildChunkHierarchy(pages: PdfPage[]): ChunkHierarchy {
  applyPageSignals(pages);
  const { sections, blocks } = detectBlocksFromDocument(pages);
  const parents = parentChunksFromBlocks(blocks);
  const nodes: HierarchyNode[] = parents.map((parent, index) => {
    const pendingId = `pending:${index}`;
    return {
      parent,
      children: childChunksFromParent(parent, pendingId),
    };
  });
  return { sections, blocks, nodes };
}

export function flattenHierarchyChildren(hierarchy: ChunkHierarchy): TextChunk[] {
  return hierarchy.nodes.flatMap((n) => n.children);
}
