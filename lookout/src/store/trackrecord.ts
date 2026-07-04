import { db } from "./db.ts";
import type { Interpretation } from "../interpret/schema.ts";

const insertStmt = db.prepare(`
  INSERT INTO calibration (situation_id, ts, market_ref, ai_prob, market_prob, gap, depth)
  VALUES ($sid, $ts, $ref, $ai, $mkt, $gap, $depth)
`);

/**
 * Log every AI-vs-market calibration point from an interpretation. Over time
 * this is Lookout's track record — how far, and how often, its read diverges
 * from the money. (Once markets settle, these points can be scored for who was
 * right; for now they accumulate the divergence history.)
 */
export function recordCalibration(situationId: string, ts: string, interp: Interpretation) {
  for (const mc of interp.marketCalibration) {
    insertStmt.run({
      $sid: situationId, $ts: ts, $ref: mc.marketRef,
      $ai: mc.aiProb, $mkt: mc.marketProb, $gap: mc.gap, $depth: interp.depth,
    });
  }
}

export interface TrackSummary {
  points: number;
  meanAbsGap: number;
  divergences: number; // |gap| >= 0.10
  maxAbsGap: number;
}

const summaryStmt = db.prepare(`
  SELECT COUNT(*) AS points,
         COALESCE(AVG(ABS(gap)), 0) AS meanAbsGap,
         COALESCE(MAX(ABS(gap)), 0) AS maxAbsGap,
         COALESCE(SUM(CASE WHEN ABS(gap) >= 0.10 THEN 1 ELSE 0 END), 0) AS divergences
  FROM calibration
`);

export function trackSummary(): TrackSummary {
  const r = summaryStmt.get() as { points: number; meanAbsGap: number; maxAbsGap: number; divergences: number };
  return {
    points: r.points,
    meanAbsGap: Number(r.meanAbsGap.toFixed(3)),
    maxAbsGap: Number(r.maxAbsGap.toFixed(3)),
    divergences: r.divergences,
  };
}

// --- Settlement + Brier scoring -------------------------------------------
// When a market resolves, every calibration point Lookout logged for it can be
// scored: Brier = mean((prob - outcome)^2), lower is better. Comparing the AI's
// Brier to the market's is the real question — is the analyst actually better
// calibrated than the money, or just louder?

const settleStmt = db.prepare(
  `INSERT INTO settlements (market_ref, outcome, settled_at) VALUES ($ref, $out, $ts)
   ON CONFLICT(market_ref) DO UPDATE SET outcome = $out, settled_at = $ts`,
);

export function recordSettlement(marketRef: string, outcome: 0 | 1, ts: string) {
  settleStmt.run({ $ref: marketRef, $out: outcome, $ts: ts });
}

export interface Scorecard {
  resolvedMarkets: number;
  scoredPoints: number;
  aiBrier: number | null;
  marketBrier: number | null;
  aiBetter: boolean | null; // is the AI better calibrated than the market?
}

// Join settled markets to their calibration points (market_ref may be a ticker
// embedded in the model's marketRef, so match by containment).
const scoreStmt = db.prepare(`
  SELECT COUNT(*) AS n,
         AVG((c.ai_prob - s.outcome) * (c.ai_prob - s.outcome)) AS aiBrier,
         AVG((c.market_prob - s.outcome) * (c.market_prob - s.outcome)) AS marketBrier,
         COUNT(DISTINCT s.market_ref) AS markets
  FROM settlements s
  JOIN calibration c ON c.market_ref LIKE '%' || s.market_ref || '%'
`);

export function scorecard(): Scorecard {
  const r = scoreStmt.get() as { n: number; aiBrier: number | null; marketBrier: number | null; markets: number };
  if (!r.n) return { resolvedMarkets: 0, scoredPoints: 0, aiBrier: null, marketBrier: null, aiBetter: null };
  const ai = Number(r.aiBrier!.toFixed(4));
  const mkt = Number(r.marketBrier!.toFixed(4));
  return { resolvedMarkets: r.markets, scoredPoints: r.n, aiBrier: ai, marketBrier: mkt, aiBetter: ai < mkt };
}
