/**
 * Reciprocal Rank Fusion (Cormack et al.).
 * score(d) = Σ 1 / (k + rank_i(d)) across ranked lists (1-based ranks).
 */

export type RrfHit = {
  id: string;
  score: number;
  /** Which input lists contained this id (0-based list indexes). */
  lists: number[];
};

export type RrfOptions = {
  /** RRF constant; default 60. */
  k?: number;
  /** Keep top N after fusion. */
  topN?: number;
};

export function reciprocalRankFusion(
  rankedLists: string[][],
  opts: RrfOptions = {},
): RrfHit[] {
  const k = opts.k ?? 60;
  const topN = opts.topN ?? rankedLists.reduce((m, l) => Math.max(m, l.length), 0);
  const scores = new Map<string, { score: number; lists: Set<number> }>();

  rankedLists.forEach((list, listIndex) => {
    const seen = new Set<string>();
    list.forEach((id, idx) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const rank = idx + 1;
      const cur = scores.get(id) ?? { score: 0, lists: new Set<number>() };
      cur.score += 1 / (k + rank);
      cur.lists.add(listIndex);
      scores.set(id, cur);
    });
  });

  return [...scores.entries()]
    .map(([id, v]) => ({
      id,
      score: v.score,
      lists: [...v.lists].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, topN));
}
