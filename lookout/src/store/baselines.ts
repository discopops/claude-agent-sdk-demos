import { db } from "./db.ts";

export interface Baseline {
  ewmaMean: number;
  ewmaVar: number;
  sampleN: number;
}

const getStmt = db.prepare(
  `SELECT ewma_mean AS ewmaMean, ewma_var AS ewmaVar, sample_n AS sampleN
   FROM baselines WHERE entity_key = ? AND source_id = ? AND metric_name = ?`,
);

const upsertStmt = db.prepare(`
  INSERT INTO baselines (entity_key, source_id, metric_name, ewma_mean, ewma_var, sample_n, updated_at)
  VALUES ($ek, $src, $metric, $mean, $var, $n, $ts)
  ON CONFLICT(entity_key, source_id, metric_name) DO UPDATE SET
    ewma_mean = $mean, ewma_var = $var, sample_n = $n, updated_at = $ts
`);

const ALPHA = 0.3; // EWMA smoothing

export function getBaseline(entityKey: string, sourceId: string, metric: string): Baseline | null {
  return getStmt.get(entityKey, sourceId, metric) as Baseline | null;
}

/**
 * Fold a new observation into the running EWMA mean/variance and persist.
 * Returns the baseline as it was BEFORE this update (so the caller can score
 * the current value against history, not against itself).
 */
export function updateBaseline(
  entityKey: string,
  sourceId: string,
  metric: string,
  value: number,
  ts: string,
): Baseline {
  const prev = getBaseline(entityKey, sourceId, metric);
  if (!prev) {
    upsertStmt.run({ $ek: entityKey, $src: sourceId, $metric: metric, $mean: value, $var: 0, $n: 1, $ts: ts });
    return { ewmaMean: value, ewmaVar: 0, sampleN: 1 };
  }
  const diff = value - prev.ewmaMean;
  const mean = prev.ewmaMean + ALPHA * diff;
  const variance = (1 - ALPHA) * (prev.ewmaVar + ALPHA * diff * diff);
  upsertStmt.run({
    $ek: entityKey, $src: sourceId, $metric: metric,
    $mean: mean, $var: variance, $n: prev.sampleN + 1, $ts: ts,
  });
  return prev; // pre-update baseline for scoring
}
