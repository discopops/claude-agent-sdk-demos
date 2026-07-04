import type { NormalizedSignal } from "../types.ts";
import type { Interpretation } from "./schema.ts";

/**
 * Make the AI-vs-market gap deterministic. The model proposes aiProb and names a
 * market; we overwrite marketProb with the REAL implied probability from the
 * Kalshi signal (matched by ticker/title) and recompute gap = aiProb - marketProb.
 * The model's job is the judgement; the arithmetic is ours.
 */
export function calibrate(interp: Interpretation, signals: NormalizedSignal[]): Interpretation {
  const markets = signals.filter((s) => s.sourceId === "kalshi");
  interp.marketCalibration = interp.marketCalibration.map((mc) => {
    const match =
      markets.find((m) => m.rawRef && mc.marketRef.includes(m.rawRef)) ??
      markets.find((m) => m.text && mc.marketRef && m.text.toLowerCase().includes(mc.marketRef.toLowerCase().slice(0, 12)));
    const marketProb = match ? match.metric.value : mc.marketProb;
    const gap = Number((mc.aiProb - marketProb).toFixed(3));
    return { ...mc, marketProb, gap };
  });
  return interp;
}
