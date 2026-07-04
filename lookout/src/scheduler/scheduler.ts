import salienceCfg from "../../config/salience.json" with { type: "json" };
import { getProfile } from "../profile/profile.ts";
import { pollAll, healthReport } from "../adapters/registry.ts";
import { insertSignals } from "../store/signals.ts";
import { buildSituations } from "../resolve/situations.ts";
import { scoreComponents } from "../salience/score.ts";
import { route } from "../salience/router.ts";
import { getSituationMemory, upsertSituation, markSurfaced, recordEvent } from "../store/situations.ts";
import { getLatestInterpretation, saveInterpretation } from "../store/interpretations.ts";
import { recordCalibration, trackSummary } from "../store/trackrecord.ts";
import { interpret } from "../interpret/engine.ts";
import { printCard, logJsonl } from "../delivery/console.ts";
import { publish } from "../delivery/bus.ts";
import { spokenLine } from "../delivery/interrupt.ts";
import { setCurrent } from "../state/current.ts";

const MIN_BASE_TO_INTERPRET = salienceCfg.minBaseToInterpret ?? 0.4;
const WINDOW = salienceCfg.windowMinutes ?? 60;

function hashInterp(whatsHappening: string): string {
  let h = 0;
  for (let i = 0; i < whatsHappening.length; i++) h = (h * 31 + whatsHappening.charCodeAt(i)) | 0;
  return String(h);
}

export async function runTick(tickNo: number) {
  const now = new Date();
  const profile = getProfile();
  const ts = now.toISOString();

  const signals = await pollAll({ windowMinutes: WINDOW, now });
  insertSignals(signals);
  const situations = buildSituations(signals, now);

  const health = healthReport(); // after poll so modes reflect live-vs-fallback reality
  console.log(
    `\n\x1b[1m━━ tick ${tickNo} ━━\x1b[0m \x1b[2m${ts}\x1b[0m  ` +
      health.map((h) => `${h.id}:${h.mode}${h.ok ? "" : "!"}`).join("  "),
  );
  publish({ type: "tick", ts, tick: tickNo, health });

  // score everything, decide what earns interpretation
  const scored = situations
    .map((sit) => {
      const mem = getSituationMemory(sit.id);
      const comps = scoreComponents(sit, profile, ts);
      const sal = route(sit, comps, profile, now, mem);
      upsertSituation(sit, sal.score, ts);
      return { sit, sal };
    })
    .sort((a, b) => b.sal.score - a.sal.score);

  setCurrent(scored.map(({ sit, sal }) => ({ sit, salience: sal }))); // for on-demand "dig in"

  const canInterpret =
    !process.env.LOOKOUT_NO_LLM &&
    !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR || process.env.ANTHROPIC_BASE_URL);
  if (!canInterpret) console.log("\x1b[33m[warn] no Claude auth — printing salience only, no interpretation.\x1b[0m");

  for (const { sit, sal } of scored) {
    const worthInterpreting = canInterpret && (sal.action !== "silent" || sal.base >= MIN_BASE_TO_INTERPRET);
    let interp;
    if (worthInterpreting) {
      try {
        const prev = getLatestInterpretation(sit.id) ?? undefined;
        interp = await interpret(sit, profile, prev);
        saveInterpretation(sit.id, ts, interp);
        recordCalibration(sit.id, ts, interp);
      } catch (err) {
        console.error(`[interpret] ${sit.id} failed:`, (err as Error).message);
      }
    }

    printCard(sit, sal, interp);
    recordEvent(sit.id, ts, sal, worthInterpreting ? 1 : 0, sal.materialChange ? "material change" : null);
    logJsonl({ ts, tick: tickNo, situation: sit.id, salience: sal, interpretation: interp ?? null });

    publish({
      type: "card",
      ts, tick: tickNo,
      situationId: sit.id,
      title: sit.title,
      entityKeys: sit.entityKeys,
      activeSources: sit.activeSources,
      salience: sal,
      interpretation: interp ?? null,
    });

    if (sal.action !== "silent" && interp) {
      markSurfaced(sit.id, sal.score, sal.base, hashInterp(interp.whatsHappening), ts);
      if (sal.action === "interrupt") {
        publish({ type: "interrupt", ts, situationId: sit.id, title: sit.title, text: spokenLine(sit.title, interp) });
      }
    }
  }

  const track = trackSummary();
  publish({ type: "track", ts, points: track.points, meanAbsGap: track.meanAbsGap, divergences: track.divergences });
}
