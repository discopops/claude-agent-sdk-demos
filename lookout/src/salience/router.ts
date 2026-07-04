import type { Salience, Situation } from "../types.ts";
import type { Profile } from "../profile/profile.ts";
import type { Components } from "./score.ts";
import type { SituationMemory } from "../store/situations.ts";

/** Novelty decay since last surfaced; resets toward 1 on material change. */
function novelty(mem: SituationMemory | null, profile: Profile, now: Date, materialChange: boolean): number {
  if (!mem?.lastSurfacedAt) return 1;
  if (materialChange) return 1;
  const dtMins = (now.getTime() - new Date(mem.lastSurfacedAt).getTime()) / 60_000;
  return Math.exp(-dtMins / profile.weights.noveltyTauMins);
}

export interface Routed extends Salience {
  novelty: number;
  materialChange: boolean;
}

/**
 * Turn salience components into a final score + delivery decision. Relevance is
 * a multiplicative gate (R^gamma) so off-profile situations can never interrupt,
 * however loud. Novelty enforces "report changes, not repeats".
 *
 * Takes the memory row the caller already loaded (no extra DB read). Material
 * change is measured base-to-base (comparing the pre-gating `base` now vs. the
 * base at last surface), so it isn't confused by relevance/novelty gating.
 */
export function route(
  sit: Situation,
  c: Components,
  profile: Profile,
  now: Date,
  mem: SituationMemory | null,
): Routed {
  const materialChange = mem?.lastSurfacedBase != null && Math.abs(c.base - mem.lastSurfacedBase) >= 0.15;
  const N = novelty(mem, profile, now, materialChange);
  const gamma = profile.weights.relevanceGamma;
  const score = Math.pow(c.relevance, gamma) * c.base * N;

  const t = profile.thresholds;
  let action: Salience["action"] = "silent";
  if (score >= t.digest) action = "digest";
  if (score >= t.interrupt && c.relevance >= t.relevanceMin) action = "interrupt";

  return { ...c, novelty: N, score, action, materialChange };
}
