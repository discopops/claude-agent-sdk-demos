import { db } from "./db.ts";
import type { Salience, Situation } from "../types.ts";

interface SituationRow {
  id: string;
  entity_keys: string;
  title: string;
  first_seen: string;
  last_updated: string;
  last_score: number | null;
  last_surfaced_score: number | null;
  last_surfaced_at: string | null;
  surfaced_hash: string | null;
}

const getStmt = db.prepare(`SELECT * FROM situations WHERE id = ?`);

const upsertStmt = db.prepare(`
  INSERT INTO situations (id, entity_keys, title, first_seen, last_updated, last_score)
  VALUES ($id, $ek, $title, $ts, $ts, $score)
  ON CONFLICT(id) DO UPDATE SET
    entity_keys = $ek, title = $title, last_updated = $ts, last_score = $score
`);

const surfacedStmt = db.prepare(`
  UPDATE situations SET last_surfaced_score = $score, last_surfaced_at = $ts, surfaced_hash = $hash
  WHERE id = $id
`);

const eventStmt = db.prepare(`
  INSERT INTO situation_events (situation_id, ts, score, components, tier, action, delta_summary)
  VALUES ($id, $ts, $score, $components, $tier, $action, $delta)
`);

export interface SituationMemory {
  lastSurfacedScore: number | null;
  lastSurfacedAt: string | null;
  surfacedHash: string | null;
  firstSeen: string | null;
}

export function getSituationMemory(id: string): SituationMemory | null {
  const row = getStmt.get(id) as SituationRow | null;
  if (!row) return null;
  return {
    lastSurfacedScore: row.last_surfaced_score,
    lastSurfacedAt: row.last_surfaced_at,
    surfacedHash: row.surfaced_hash,
    firstSeen: row.first_seen,
  };
}

export function upsertSituation(sit: Situation, score: number, ts: string) {
  upsertStmt.run({ $id: sit.id, $ek: JSON.stringify(sit.entityKeys), $title: sit.title, $ts: ts, $score: score });
}

export function markSurfaced(id: string, score: number, hash: string, ts: string) {
  surfacedStmt.run({ $id: id, $score: score, $hash: hash, $ts: ts });
}

export function recordEvent(
  situationId: string,
  ts: string,
  sal: Salience,
  tier: number,
  deltaSummary: string | null,
) {
  eventStmt.run({
    $id: situationId, $ts: ts, $score: sal.score,
    $components: JSON.stringify(sal), $tier: tier, $action: sal.action, $delta: deltaSummary,
  });
}
