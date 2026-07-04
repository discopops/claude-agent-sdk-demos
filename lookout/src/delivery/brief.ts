import { listCurrent } from "../state/current.ts";
import { getLatestInterpretation } from "../store/interpretations.ts";
import { publish } from "./bus.ts";

/**
 * Compile a short spoken brief from the current board — the top few situations
 * that cleared the digest bar, each as one line: what's happening + the crowd's
 * dominant mood + the sharpest market-calibration read. This is what Lookout
 * says at your scheduled brief time, or on demand.
 */
export function buildAndPublishBrief(label: string, topN = 3) {
  const ts = new Date().toISOString();
  const entries = listCurrent().filter((e) => e.salience.action !== "silent").slice(0, topN);

  const items: { title: string; line: string }[] = [];
  for (const e of entries) {
    const interp = getLatestInterpretation(e.sit.id);
    if (!interp) continue;
    const mood = interp.crowdMindState.moods.slice(0, 2).join(" and ");
    const mkt = interp.marketCalibration[0];
    const mktBit = mkt
      ? ` Market ${Math.round(mkt.marketProb * 100)}%, my read ${Math.round(mkt.aiProb * 100)}%.`
      : "";
    items.push({
      title: e.sit.title,
      line: `${interp.whatsHappening.split(/(?<=[.!?])\s/)[0]} Crowd is ${mood}.${mktBit}`,
    });
  }

  const spoken =
    items.length === 0
      ? "Nothing has cleared the bar since your last brief. All quiet."
      : `${label}. ${items.length} thing${items.length > 1 ? "s" : ""} worth knowing. ` +
        items.map((it, i) => `${i + 1}. ${it.title}. ${it.line}`).join(" ");

  publish({ type: "brief", ts, label, text: spoken, items });
  return { label, text: spoken, items };
}
