// Core cross-cutting domain types. Kept in one place to avoid import cycles
// between adapters, resolution, salience, and the interpretation engine.

/** What kind of thing a signal measures. Each source contributes a dimension. */
export type Dimension = "attention" | "narrative" | "conviction" | "events";

/** The canonical shape every source adapter normalizes into. */
export interface NormalizedSignal {
  id: string;
  sourceId: string; // "kalshi" | "x" | "trends" | future OSINT sources
  dimension: Dimension;
  observedAt: string; // ISO
  windowStart: string; // ISO
  windowEnd: string; // ISO
  entityKeys: string[]; // resolved L2 slugs
  geo?: { country?: string; lat?: number; lon?: number };
  metric: { name: string; value: number; unit: string }; // mentions | prob | index ...
  delta?: { prevValue: number; changePct: number; ratePerMin: number };
  conviction?: number; // 0..1 — only markets set this (price move x volume)
  text?: string; // representative human expression (for interpretation)
  url?: string;
  rawRef?: string; // opaque pointer back to the source payload
}

/** A cluster of signals about the same entity/topic within a window. */
export interface Situation {
  id: string; // stable slug from entity keys
  entityKeys: string[];
  title: string;
  signals: NormalizedSignal[];
  firstSeen: string;
  lastUpdated: string;
  activeSources: string[]; // distinct sourceIds contributing this window
}

/** Salience components + final score for a situation this cycle. */
export interface Salience {
  velocity: number; // V 0..1
  convergence: number; // C 0..1
  conviction: number; // K 0..1
  relevance: number; // R 0..1
  novelty: number; // N 0..1
  base: number; // wV*V + wC*C + wK*K
  score: number; // R^gamma * base * N
  action: "silent" | "digest" | "interrupt";
}
