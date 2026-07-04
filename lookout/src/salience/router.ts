import type { Salience, Situation } from "../types.ts";
import type { Profile } from "../profile/profile.ts";
import type { Components } from "./score.ts";
import { getSituationMemory } from "../store/situations.ts";

/** Novelty decay since last surfaced; resets toward 1 on material change. */
function novelty(situationId: string, profile: Profile, now: Date, materialChange: boolean): number {
  const mem = getSituationMemory(situationId);
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
 */
export function route(
  sit: Situation,
  c: Components,
  profile: Profile,
  now: Date,
  prevScore: number | null,
): Routed {
  const materialChange = prevScore != null && Math.abs(c.base - prevScore) >= 0.15;
  const N = novelty(sit.id, profile, now, materialChange);
  const gamma = profile.weights.relevanceGamma;
  const score = Math.pow(c.relevance, gamma) * c.base * N;

  const t = profile.thresholds;
  let action: Salience["action"] = "silent";
  if (score >= t.digest) action = "digest";
  if (score >= t.interrupt && c.relevance >= t.relevanceMin) action = "interrupt";

  return { ...c, novelty: N, score, action, materialChange };
}
