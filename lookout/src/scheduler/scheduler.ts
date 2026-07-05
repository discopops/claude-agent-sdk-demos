import { existsSync } from "node:fs";
import salienceCfg from "../../config/salience.json" with { type: "json" };
import { getProfile } from "../profile/profile.ts";
import { pollAll, healthReport } from "../adapters/registry.ts";
import { insertSignals } from "../store/signals.ts";
import { buildSituations } from "../resolve/situations.ts";
import { scoreComponents } from "../salience/score.ts";
import { route } from "../salience/router.ts";
import { getSituationMemory, upsertSituation, markSurfaced, recordEvent } from "../store/situations.ts";
import { getLatestInterpretation, saveInterpretation } from "../store/interpretations.ts";
import { recordCalibration, trackSummary, scorecard } from "../store/trackrecord.ts";
import { ingestSettlements } from "../adapters/settlements.ts";
import { interpret } from "../interpret/engine.ts";
import { printCard, logJsonl } from "../delivery/console.ts";
import { publish } from "../delivery/bus.ts";
import { spokenLine } from "../delivery/interrupt.ts";
import { setCurrent } from "../state/current.ts";
import { runDeepPass } from "../research/run.ts";
import { llmRelevance, llmRelevanceEnabled } from "../triage/relevance.ts";
import type { Situation } from "../types.ts";
import type { Routed } from "../salience/router.ts";
import type { Profile } from "../profile/profile.ts";

const MIN_BASE_TO_INTERPRET = salienceCfg.minBaseToInterpret ?? 0.4;
const WINDOW = salienceCfg.windowMinutes ?? 60;
const AUTODEEP_COOLDOWN_MS = Number(process.env.LOOKOUT_AUTODEEP_COOLDOWN_MINS ?? 45) * 60_000;

// Standing questions on ever-present situations (e.g. the zeitgeist panorama)
// would otherwise auto-deep EVERY tick — 4 model calls a pop. Cool down per
// situation; interrupts still punch through.
const lastAutoDeepAt = new Map<string, number>();

/** Why (if at all) a situation should auto-escalate to a deep multi-agent pass. */
function autoDeepReason(sit: Situation, sal: Routed, profile: Profile): string | null {
  if (sal.action === "interrupt") return "interrupt-level salience";
  const cooled = Date.now() - (lastAutoDeepAt.get(sit.id) ?? 0) >= AUTODEEP_COOLDOWN_MS;
  if (!cooled) return null;
  for (const q of profile.standingQuestions) {
    if (q.active && q.entities.some((e) => sit.entityKeys.includes(e))) return `standing question: "${q.text}"`;
  }
  return null;
}

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

  // Auth can come from an explicit key/env channel OR from the spawned Claude
  // Code binary's own login (subscription mode — the CLI manages its own
  // credentials, so the binary existing is the signal we can try).
  const claudeBin = process.env.LOOKOUT_CLAUDE_BIN ?? "/opt/node22/bin/claude";
  const canInterpret =
    !process.env.LOOKOUT_NO_LLM &&
    !!(
      process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR ||
      process.env.ANTHROPIC_BASE_URL ||
      existsSync(claudeBin)
    );

  // score everything, decide what earns interpretation
  const prelim = situations.map((sit) => ({
    sit,
    mem: getSituationMemory(sit.id),
    comps: scoreComponents(sit, profile, ts), // keyword relevance by default
  }));

  // Optional: replace keyword relevance with a sharper LLM triage (env-gated).
  if (llmRelevanceEnabled() && canInterpret) {
    await Promise.all(
      prelim
        .filter((p) => p.comps.base >= MIN_BASE_TO_INTERPRET)
        .map(async (p) => {
          try {
            const r = await llmRelevance(p.sit, profile);
            p.comps.relevance = r.score;
          } catch (err) {
            console.error(`[relevance] ${p.sit.id} triage failed, keeping keyword:`, (err as Error).message);
          }
        }),
    );
  }

  const scored = prelim
    .map(({ sit, mem, comps }) => {
      const sal = route(sit, comps, profile, now, mem);
      upsertSituation(sit, sal.score, ts);
      return { sit, sal };
    })
    .sort((a, b) => b.sal.score - a.sal.score);

  setCurrent(scored.map(({ sit, sal }) => ({ sit, salience: sal }))); // for on-demand "dig in"

  if (!canInterpret) console.log("\x1b[33m[warn] no Claude auth — printing salience only, no interpretation.\x1b[0m");

  const deepCandidates: { sit: Situation; sal: typeof scored[number]["sal"]; reason: string }[] = [];

  for (const { sit, sal } of scored) {
    // The zeitgeist panorama is always read: it is single-source by design, so
    // convergence math can never lift it over the gate — but "what is the world
    // on about" is the standing question the board exists to answer.
    const isZeitgeist = sit.entityKeys.includes("zeitgeist");
    const worthInterpreting =
      canInterpret && (isZeitgeist || sal.action !== "silent" || sal.base >= MIN_BASE_TO_INTERPRET);
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
      // trimmed raw signals so the client can show the receipts (trend chips,
      // market lines) without another round trip
      signals: sit.signals.slice(0, 14).map((s) => ({
        sourceId: s.sourceId,
        text: s.text ?? "",
        value: s.metric.value,
        unit: s.metric.unit,
        geo: s.geo?.country ?? null,
      })),
    });

    if (sal.action !== "silent" && interp) {
      markSurfaced(sit.id, sal.score, sal.base, hashInterp(interp.whatsHappening), ts);
      if (sal.action === "interrupt") {
        publish({ type: "interrupt", ts, situationId: sit.id, title: sit.title, text: spokenLine(sit.title, interp) });
      }
    }

    if (interp) {
      const reason = autoDeepReason(sit, sal, profile);
      if (reason) deepCandidates.push({ sit, sal, reason });
    }
  }

  // Auto-escalate the top candidates to a deep multi-agent pass (budget-capped).
  if (canInterpret && process.env.LOOKOUT_AUTO_DEEP !== "0") {
    const max = Number(process.env.LOOKOUT_MAX_AUTODEEP ?? 1);
    for (const { sit, sal, reason } of deepCandidates.sort((a, b) => b.sal.score - a.sal.score).slice(0, max)) {
      console.log(`\x1b[36m[auto-deep]\x1b[0m ${sit.id} — ${reason}`);
      lastAutoDeepAt.set(sit.id, Date.now());
      try {
        await runDeepPass(sit, sal, profile);
      } catch (err) {
        console.error(`[auto-deep] ${sit.id} failed:`, (err as Error).message);
      }
    }
  }

  await ingestSettlements(); // pull resolved-market outcomes (live or fixture)
  const track = trackSummary();
  const sc = scorecard();
  publish({
    type: "track", ts,
    points: track.points, meanAbsGap: track.meanAbsGap, divergences: track.divergences,
    scored: sc.scoredPoints, aiBrier: sc.aiBrier, marketBrier: sc.marketBrier, aiBetter: sc.aiBetter,
  });
}
