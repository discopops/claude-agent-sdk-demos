import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Situation } from "../types.ts";
import type { Routed } from "../salience/router.ts";
import type { Interpretation } from "../interpret/schema.ts";

const LOG = resolve(import.meta.dir, "../../logs/lookout.jsonl");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function actionBadge(action: string): string {
  if (action === "interrupt") return c.red("● INTERRUPT");
  if (action === "digest") return c.yellow("● digest");
  return c.dim("· silent");
}

export function printCard(sit: Situation, sal: Routed, interp?: Interpretation) {
  const bar =
    `${actionBadge(sal.action)}  ${c.bold(sit.title)}  ` +
    c.dim(`score ${sal.score.toFixed(2)}  [V ${sal.velocity.toFixed(2)} C ${sal.convergence.toFixed(2)} K ${sal.conviction.toFixed(2)} R ${sal.relevance.toFixed(2)} N ${sal.novelty.toFixed(2)}]  src:${sit.activeSources.join("+")}`);
  console.log("\n" + bar);

  if (!interp) {
    console.log(c.dim("  (below interpretation threshold)"));
    return;
  }
  console.log("  " + c.cyan("what: ") + interp.whatsHappening);
  console.log(
    "  " + c.cyan("mood: ") +
      `${interp.crowdMindState.moods.join(", ")} ` +
      c.dim(`(intensity ${interp.crowdMindState.intensity.toFixed(2)})`) +
      " — " + interp.crowdMindState.drivers,
  );
  for (const a of interp.likelyActions) {
    console.log("  " + c.cyan("likely: ") + `${a.action} ` + c.dim(`~${(a.probability * 100).toFixed(0)}%, ${a.horizon}`));
  }
  for (const mc of interp.marketCalibration) {
    const gap = mc.gap >= 0 ? c.green(`+${(mc.gap * 100).toFixed(0)}pts`) : c.red(`${(mc.gap * 100).toFixed(0)}pts`);
    console.log(
      "  " + c.cyan("market: ") +
        `${mc.marketRef} — AI ${(mc.aiProb * 100).toFixed(0)}% vs market ${(mc.marketProb * 100).toFixed(0)}% (${gap}) — ${mc.read}`,
    );
  }
  console.log(
    "  " + c.cyan("so what: ") + interp.soWhat + " " +
      c.dim(`[confidence ${interp.confidence.toFixed(2)}${interp.unconfirmed ? ", UNCONFIRMED" : ""}]`),
  );
}

export function logJsonl(record: unknown) {
  try {
    appendFileSync(LOG, JSON.stringify(record) + "\n");
  } catch {
    /* logging is best-effort */
  }
}
