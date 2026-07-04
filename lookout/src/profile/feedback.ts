import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordFeedback, type FeedbackAction } from "../store/feedback.ts";

const PROFILE_PATH = resolve(import.meta.dir, "../../config/profile.json");

// How each feedback action nudges the per-entity relevance bias.
const NUDGE: Record<FeedbackAction, number> = { open: 0.05, flag: 0.2, dismiss: -0.15, mute: -0.4 };
const CLAMP = 0.6;

/**
 * Apply a user's feedback on a situation: record it, and nudge the relevance
 * bias for that situation's entities in config/profile.json. Writing the file
 * triggers the profile hot-reload, so the lens shifts on the next tick — the
 * loop closes with no restart.
 */
export function applyFeedback(situationId: string, entityKeys: string[], action: FeedbackAction): Record<string, number> {
  const ts = new Date().toISOString();
  const raw = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
  raw.feedbackBias ??= {};

  const nudge = NUDGE[action];
  const delta: Record<string, number> = {};
  for (const key of entityKeys) {
    const next = Math.max(-CLAMP, Math.min(CLAMP, (raw.feedbackBias[key] ?? 0) + nudge));
    raw.feedbackBias[key] = Number(next.toFixed(3));
    delta[key] = raw.feedbackBias[key];
  }

  writeFileSync(PROFILE_PATH, JSON.stringify(raw, null, 2) + "\n");
  recordFeedback(situationId, action, delta, ts);
  return delta;
}
