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
