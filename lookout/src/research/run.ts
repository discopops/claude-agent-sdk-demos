import type { Situation } from "../types.ts";
import type { Routed } from "../salience/router.ts";
import type { Profile } from "../profile/profile.ts";
import { deepInterpret } from "./deep.ts";
import { getLatestInterpretation, saveInterpretation } from "../store/interpretations.ts";
import { recordCalibration } from "../store/trackrecord.ts";
import { publish } from "../delivery/bus.ts";

/**
 * Run a deep multi-agent pass for one situation and deliver it: stream the
 * stages as activity, persist + calibrate the result, and publish the deep
 * card. Shared by the on-demand "dig in" endpoint and the scheduler's
 * auto-escalation so both behave identically.
 */
export async function runDeepPass(sit: Situation, salience: Routed, profile: Profile) {
  const prev = getLatestInterpretation(sit.id) ?? undefined;
  const interp = await deepInterpret(sit, profile, prev, (stage) =>
    publish({ type: "activity", ts: new Date().toISOString(), situationId: sit.id, stage }),
  );
  const ts = new Date().toISOString();
  saveInterpretation(sit.id, ts, interp);
  recordCalibration(sit.id, ts, interp);
  publish({
    type: "card", ts, tick: -1,
    situationId: sit.id, title: sit.title, entityKeys: sit.entityKeys,
    activeSources: sit.activeSources, salience, interpretation: interp,
  });
  return interp;
}
