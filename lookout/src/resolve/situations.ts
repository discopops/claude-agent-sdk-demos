import type { NormalizedSignal, Situation } from "../types.ts";

/** Minimal union-find for clustering entity keys that co-occur in signals. */
class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function humanize(keys: string[]): string {
  return keys
    .map((k) => k.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" + ");
}

/**
 * L2 aggregation: signals that share (transitively) an entity key merge into a
 * single Situation. So an X post tagged [openai, ai] and a Trends query tagged
 * [ai] land in the same situation; a Fed market stays separate. This is the
 * lightweight resolver — swap for a GDELT-NER-backed one later behind the same
 * Situation output.
 */
export function buildSituations(signals: NormalizedSignal[], now: Date): Situation[] {
  const uf = new UnionFind();
  for (const s of signals) {
    for (const k of s.entityKeys) uf.find(k);
    for (let i = 1; i < s.entityKeys.length; i++) uf.union(s.entityKeys[0]!, s.entityKeys[i]!);
  }

  // group signals by component root
  const byRoot = new Map<string, NormalizedSignal[]>();
  for (const s of signals) {
    if (s.entityKeys.length === 0) continue;
    const root = uf.find(s.entityKeys[0]!);
    (byRoot.get(root) ?? byRoot.set(root, []).get(root)!).push(s);
  }

  const situations: Situation[] = [];
  for (const group of byRoot.values()) {
    const keys = [...new Set(group.flatMap((s) => s.entityKeys))].sort();
    const id = keys.join("+");
    situations.push({
      id,
      entityKeys: keys,
      title: humanize(keys),
      signals: group,
      firstSeen: now.toISOString(),
      lastUpdated: now.toISOString(),
      activeSources: [...new Set(group.map((s) => s.sourceId))],
    });
  }
  return situations;
}
