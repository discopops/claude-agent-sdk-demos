import { db } from "./db.ts";

const stmt = db.prepare(`
  INSERT INTO feedback (situation_id, ts, action, profile_delta)
  VALUES ($id, $ts, $action, $delta)
`);

export type FeedbackAction = "open" | "dismiss" | "flag" | "mute";

export function recordFeedback(situationId: string, action: FeedbackAction, delta: Record<string, number>, ts: string) {
  stmt.run({ $id: situationId, $ts: ts, $action: action, $delta: JSON.stringify(delta) });
}
