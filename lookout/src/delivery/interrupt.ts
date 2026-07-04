import type { Interpretation } from "../interpret/schema.ts";

/**
 * A short, speakable briefing line for an earned interrupt. Tight on purpose —
 * this is the sentence Lookout says out loud when something crosses the bar.
 */
export function spokenLine(title: string, interp: Interpretation): string {
  const mood = interp.crowdMindState.moods.slice(0, 2).join(" and ");
  const top = [...interp.likelyActions].sort((a, b) => b.probability - a.probability)[0];
  const soWhat = interp.soWhat.split(/(?<=[.!?])\s/)[0];
  const parts = [
    `Heads up on ${title}.`,
    mood ? `The crowd is ${mood}.` : "",
    top ? `Most likely next: ${top.action}, around ${Math.round(top.probability * 100)} percent.` : "",
    soWhat,
  ];
  return parts.filter(Boolean).join(" ");
}
