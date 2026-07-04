import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Situation } from "../types.ts";
import type { Profile } from "../profile/profile.ts";
import { renderSituation, emitInterpretation, runAnalyst } from "../interpret/engine.ts";
import { calibrate } from "../interpret/calibrate.ts";
import type { Interpretation } from "../interpret/schema.ts";

const P = (name: string) => readFileSync(resolve(import.meta.dir, "prompts", name), "utf8");
const NARRATIVE = P("narrative.txt");
const MARKET = P("market.txt");
const SKEPTIC = P("skeptic.txt");
const SYNTH = P("synthesizer.txt");

export type DeepStage = "narrative" | "market" | "skeptic" | "synthesizing" | "done";

/**
 * Deep multi-agent interpretation (T2). Fans out three angle analysts in
 * parallel — narrative, market, and an adversarial skeptic — then a lead
 * synthesizer adjudicates them into one calibrated Interpretation that also
 * owns how it has changed from the prior read. Costs 4 model calls, so it's
 * on-demand ("dig in") or reserved for the highest-salience situations.
 */
export async function deepInterpret(
  sit: Situation,
  profile: Profile,
  prev?: Interpretation,
  onStage?: (stage: DeepStage) => void,
): Promise<Interpretation> {
  const base = renderSituation(sit, profile, prev);

  const [narrative, market, skeptic] = await Promise.all([
    runAnalyst(NARRATIVE, base).then((r) => (onStage?.("narrative"), r)),
    runAnalyst(MARKET, base).then((r) => (onStage?.("market"), r)),
    runAnalyst(SKEPTIC, base).then((r) => (onStage?.("skeptic"), r)),
  ]);

  onStage?.("synthesizing");
  const synthUser =
    `${base}\n\nANALYST MEMOS:\n` +
    `--- NARRATIVE ANALYST ---\n${narrative}\n\n` +
    `--- MARKET ANALYST ---\n${market}\n\n` +
    `--- SKEPTIC ---\n${skeptic}\n`;

  const interp = await emitInterpretation(SYNTH, synthUser);
  interp.depth = "deep";
  onStage?.("done");
  return calibrate(interp, sit.signals);
}
