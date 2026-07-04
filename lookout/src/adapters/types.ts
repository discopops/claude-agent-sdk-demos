import type { Dimension, NormalizedSignal } from "../types.ts";

export interface PollContext {
  windowMinutes: number;
  now: Date;
}

/**
 * The pluggability contract. Every source — X, Kalshi, Trends today; GDELT,
 * ADS-B, AIS, outage monitors tomorrow — implements this and emits the same
 * NormalizedSignal, so nothing downstream (resolution/salience/interpret)
 * changes when a source is added.
 */
export interface SourceAdapter {
  id: string;
  dimension: Dimension;
  mode: "live" | "mock" | "cached";
  capabilities: { geo: boolean; conviction: boolean; entities: boolean };
  poll(ctx: PollContext): Promise<NormalizedSignal[]>;
  health(): { ok: boolean; mode: string; lastError?: string };
}

/** Compute a percentage change + per-minute rate for a metric delta. */
export function makeDelta(prevValue: number, value: number, windowMinutes: number) {
  const changePct = prevValue === 0 ? (value > 0 ? 1 : 0) : (value - prevValue) / prevValue;
  const ratePerMin = (value - prevValue) / Math.max(1, windowMinutes);
  return { prevValue, changePct, ratePerMin };
}
