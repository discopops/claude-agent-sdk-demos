import { db } from "./db.ts";
import type { Interpretation } from "../interpret/schema.ts";

const insertStmt = db.prepare(`
  INSERT INTO interpretations (situation_id, ts, body, confidence)
  VALUES ($id, $ts, $body, $confidence)
`);

const latestStmt = db.prepare(`
  SELECT body FROM interpretations WHERE situation_id = ? ORDER BY ts DESC LIMIT 1
`);

export function saveInterpretation(situationId: string, ts: string, interp: Interpretation) {
  insertStmt.run({
    $id: situationId,
    $ts: ts,
    $body: JSON.stringify(interp),
    $confidence: interp.confidence ?? null,
  });
}

/** The previous interpretation of this situation, for change detection / self-correction. */
export function getLatestInterpretation(situationId: string): Interpretation | null {
  const row = latestStmt.get(situationId) as { body: string } | null;
  return row ? (JSON.parse(row.body) as Interpretation) : null;
}
