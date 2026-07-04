import type { Situation } from "../types.ts";
import type { Routed } from "../salience/router.ts";

// The most recent tick's situations (with their salience), kept in memory so the
// server can run an on-demand deep pass ("dig in") against fresh signal without
// re-polling.

export interface CurrentEntry {
  sit: Situation;
  salience: Routed;
}

const current = new Map<string, CurrentEntry>();

export function setCurrent(entries: CurrentEntry[]) {
  current.clear();
  for (const e of entries) current.set(e.sit.id, e);
}

export function getCurrent(id: string): CurrentEntry | null {
  return current.get(id) ?? null;
}

/** All current situations, highest salience first. */
export function listCurrent(): CurrentEntry[] {
  return [...current.values()].sort((a, b) => b.salience.score - a.salience.score);
}
