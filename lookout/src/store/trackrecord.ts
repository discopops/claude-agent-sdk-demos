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

// --- Settled reckoning ------------------------------------------------------
// The deterministic half of self-correction. `wasWrong` used to be purely
// self-reported by the model; these verdicts ground it: for markets THIS
// situation was calibrated against that have since resolved, we know exactly
// what the AI said and what reality did. The verdicts are fed back into the
// next interpretation prompt so owning (or standing by) a prior call is a
// response to fact, not vibes — the same code-does-arithmetic split as calibrate().

export interface SettledVerdict {
  marketRef: string;
  aiProb: number;
  marketProb: number;
  outcome: 0 | 1;
  wrongSide: boolean; // the AI's final call was on the losing side of the settle
}

const verdictStmt = db.prepare(`
  SELECT c.market_ref AS marketRef, c.ai_prob AS aiProb, c.market_prob AS marketProb,
         s.outcome AS outcome, MAX(c.ts) AS ts
  FROM settlements s
  JOIN calibration c ON c.market_ref LIKE '%' || s.market_ref || '%'
  WHERE c.situation_id = $sid
  GROUP BY c.market_ref
  ORDER BY ts DESC
  LIMIT 4
`);

export function settledVerdictsFor(situationId: string): SettledVerdict[] {
  const rows = verdictStmt.all({ $sid: situationId }) as
    { marketRef: string; aiProb: number; marketProb: number; outcome: number }[];
  return rows.map((r) => ({
    marketRef: r.marketRef,
    aiProb: r.aiProb,
    marketProb: r.marketProb,
    outcome: (r.outcome >= 0.5 ? 1 : 0) as 0 | 1,
    wrongSide: (r.aiProb >= 0.5) !== (r.outcome >= 0.5),
  }));
}

export function scorecard(): Scorecard {
  const r = scoreStmt.get() as { n: number; aiBrier: number | null; marketBrier: number | null; markets: number };
  if (!r.n) return { resolvedMarkets: 0, scoredPoints: 0, aiBrier: null, marketBrier: null, aiBetter: null };
  const ai = Number(r.aiBrier!.toFixed(4));
  const mkt = Number(r.marketBrier!.toFixed(4));
  return { resolvedMarkets: r.markets, scoredPoints: r.n, aiBrier: ai, marketBrier: mkt, aiBetter: ai < mkt };
}
