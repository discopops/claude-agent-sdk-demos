import type { Situation } from "../types.ts";
import type { Profile } from "../profile/profile.ts";
import { updateBaseline } from "../store/baselines.ts";
import { SOURCE_COUNT } from "../adapters/registry.ts";
import salienceCfg from "../../config/salience.json" with { type: "json" };

const Z_MAX = salienceCfg.zMax ?? 4;
const WARMUP = salienceCfg.warmupSamples ?? 3;
const MAX_SOURCES = Math.max(2, SOURCE_COUNT); // convergence normalizes against all registered sources

export interface Components {
  velocity: number;
  convergence: number;
  conviction: number;
  relevance: number;
  base: number;
}

/**
 * Velocity = how fast this is moving, NOT how big it is. z-score vs the
 * situation's own EWMA baseline once warm; adapter-reported change% while the
 * baseline is cold (cold-start suppression prevents early false interrupts).
 * NOTE: folds each observation into the baseline as a side effect.
 */
function velocity(sit: Situation, ts: string): number {
  let v = 0;
  for (const s of sit.signals) {
    const pre = updateBaseline(sit.id, s.sourceId, s.metric.name, s.metric.value, ts);
    let sv = 0;
    if (pre.sampleN >= WARMUP && pre.ewmaVar > 0) {
      const z = (s.metric.value - pre.ewmaMean) / Math.sqrt(pre.ewmaVar);
      sv = Math.max(0, Math.min(1, z / Z_MAX));
    } else if (s.delta) {
      sv = Math.max(0, Math.min(1, s.delta.changePct / 2)); // +100% => 0.5, +300% => 1
    }
    v = Math.max(v, sv);
  }
  return v;
}

/** Relevance = the personalization gate. Keyword/weight match in v1; LLM triage upgrades it in Phase 1. */
export function computeRelevance(sit: Situation, profile: Profile): number {
  let r = 0.1; // small floor so a real but off-profile event isn't hard zero (gamma still filters it)
  const entityWeight = new Map(profile.entities.map((e) => [e.key, e.weight]));
  const regionCountries = new Map(
    profile.regions.filter((x) => x.geo?.country).map((x) => [x.geo!.country!, x.weight]),
  );

  for (const key of sit.entityKeys) {
    if (entityWeight.has(key)) r = Math.max(r, entityWeight.get(key)!);
    for (const it of profile.interests) {
      const words = key.split("-");
      if (words.some((w) => w.length > 2 && it.topic.toLowerCase().includes(w))) {
        r = Math.max(r, it.weight);
      }
    }
    const bias = profile.feedbackBias[key];
    if (typeof bias === "number") r = Math.max(0, Math.min(1, r + bias));
  }
  for (const s of sit.signals) {
    if (s.geo?.country && regionCountries.has(s.geo.country)) {
      r = Math.max(r, 0.6 * regionCountries.get(s.geo.country)!);
    }
  }
  return Math.min(1, r);
}

export function scoreComponents(sit: Situation, profile: Profile, ts: string): Components {
  const V = velocity(sit, ts);
  const C = (new Set(sit.activeSources).size - 1) / (MAX_SOURCES - 1);
  const marketConv = sit.signals.map((s) => s.conviction).filter((x): x is number => x != null);
  const K = marketConv.length ? Math.max(...marketConv) : 0.5;
  const R = computeRelevance(sit, profile);
  const w = profile.weights;
  const base = w.velocity * V + w.convergence * Math.max(0, C) + w.conviction * K;
  return { velocity: V, convergence: Math.max(0, C), conviction: K, relevance: R, base };
}
