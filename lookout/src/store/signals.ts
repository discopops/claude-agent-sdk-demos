import { db } from "./db.ts";
import type { NormalizedSignal } from "../types.ts";

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO signals
    (id, source_id, dimension, entity_keys, geo, metric_name, metric_value, metric_unit,
     conviction, observed_at, window_start, window_end, text, url, raw_ref)
  VALUES ($id, $source_id, $dimension, $entity_keys, $geo, $metric_name, $metric_value,
     $metric_unit, $conviction, $observed_at, $window_start, $window_end, $text, $url, $raw_ref)
`);

export function insertSignal(s: NormalizedSignal) {
  insertStmt.run({
    $id: s.id,
    $source_id: s.sourceId,
    $dimension: s.dimension,
    $entity_keys: JSON.stringify(s.entityKeys),
    $geo: s.geo ? JSON.stringify(s.geo) : null,
    $metric_name: s.metric.name,
    $metric_value: s.metric.value,
    $metric_unit: s.metric.unit,
    $conviction: s.conviction ?? null,
    $observed_at: s.observedAt,
    $window_start: s.windowStart,
    $window_end: s.windowEnd,
    $text: s.text ?? null,
    $url: s.url ?? null,
    $raw_ref: s.rawRef ?? null,
  });
}

export function insertSignals(signals: NormalizedSignal[]) {
  const tx = db.transaction((rows: NormalizedSignal[]) => {
    for (const r of rows) insertSignal(r);
  });
  tx(signals);
}
