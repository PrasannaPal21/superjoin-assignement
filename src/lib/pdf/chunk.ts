/**
 * Chunk type definitions for Classical Hybrid RAG parent/child hierarchy.
 * The flat page-packer was removed in step 7 — use:
 *   detectBlocksFromDocument → parentChunksFromBlocks → childChunksFromParent
 *   → selectExtractChildren
 */

/** Parent = section/table context; child = extract unit; flat = legacy DB rows only. */
export type ChunkKind = "parent" | "child" | "flat";

export type TextChunk = {
  pageStart: number;
  pageEnd: number;
  text: string;
  tokenEstimate: number;
  signalScore: number;
  kind: ChunkKind;
  /** Set on children — links to persisted parent chunk id. */
  parentId?: string | null;
  /** Section title from structure detection. */
  sectionTitle?: string | null;
  /** Parent/child block origin: table vs narrative. */
  blockKind?: "narrative" | "table" | null;
};
