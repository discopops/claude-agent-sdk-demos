import type { NormalizedSignal, Situation } from "../types.ts";

// Grok voices — the "what people are actually saying" lane, via xAI's Agent
// Tools API (`x_search`): Grok is the only frontier model with native
// grounding in live X posts. This is deliberately NOT a poll adapter: voices
// are ENRICHMENT — they fire only when a situation has already earned a deep
// pass (auto-escalation, standing question, or the user's "dig in"), so the
// meter (billed per tool invocation + tokens) runs a couple times an hour at
// most, under a hard daily gather cap.
//
// OFF by default. Enable with LOOKOUT_ENABLE_GROK_VOICES=1 + XAI_API_KEY.
//
// NOTE: xAI's old `search_parameters` live search was deprecated (HTTP 410,
// verified 2026-07-06); this uses the replacement /v1/responses + x_search.

const XAI_BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
const GROK_MODEL = process.env.LOOKOUT_GROK_MODEL ?? "grok-4.3";
const GATHERS_PER_DAY = Number(process.env.LOOKOUT_GROK_GATHERS_PER_DAY ?? 20);

export function grokVoicesEnabled(): boolean {
  return process.env.LOOKOUT_ENABLE_GROK_VOICES === "1" && !!process.env.XAI_API_KEY;
}

// In-memory daily budget. Restarting resets it — acceptable for a personal
// tool; the per-day cap is a cost seatbelt, not an accounting system.
let budgetDay = "";
let gathersToday = 0;

function budgetRemaining(now: Date): number {
  const day = now.toISOString().slice(0, 10);
  if (day !== budgetDay) {
    budgetDay = day;
    gathersToday = 0;
  }
  return Math.max(0, GATHERS_PER_DAY - gathersToday);
}

export function grokBudgetStatus(): { gathersToday: number; capPerDay: number } {
  return { gathersToday, capPerDay: GATHERS_PER_DAY };
}

interface GrokVoice {
  text: string; // verbatim-ish post content
  mood: string; // one-word read of the post's emotional tone
  theme: string; // what cluster of the conversation it belongs to
}

interface GrokGather {
  summary: string; // one plain sentence: what the X conversation IS
  volume: "quiet" | "steady" | "loud" | "exploding";
  voices: GrokVoice[];
}

/** Walk a /v1/responses body for the final text + any cited URLs (shape is
 * loosely documented, so this is defensive: output_text convenience field
 * first, then message items, plus url_citation-style annotations). */
function extractResponse(body: any): { text: string; citations: string[] } {
  const citations = new Set<string>();
  let text = typeof body.output_text === "string" ? body.output_text : "";
  for (const item of body.output ?? []) {
    for (const c of item.content ?? []) {
      if (!text && typeof c.text === "string") text = c.text;
      for (const a of c.annotations ?? []) {
        const url = a.url ?? a.url_citation?.url;
        if (url) citations.add(url);
      }
    }
    if (Array.isArray(item.citations)) for (const u of item.citations) citations.add(u);
  }
  if (Array.isArray(body.citations)) for (const u of body.citations) citations.add(u);
  return { text, citations: [...citations] };
}

/**
 * One gather: ask Grok to search live X for the situation's topic and return
 * representative voices as strict JSON. Throws on any failure — callers treat
 * voices as optional garnish, never load-bearing.
 */
export async function fetchGrokVoices(sit: Situation, now: Date): Promise<NormalizedSignal[]> {
  if (!grokVoicesEnabled()) return [];
  if (budgetRemaining(now) <= 0) {
    console.log(`[grok-voices] daily gather budget spent (${GATHERS_PER_DAY}) — skipping`);
    return [];
  }
  gathersToday++;

  const topic = `${sit.title} (${sit.entityKeys.join(", ")})`;
  const fromDate = new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 10);
  const res = await fetch(`${XAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: GROK_MODEL,
      tools: [{ type: "x_search", from_date: fromDate }],
      input: [
        {
          role: "user",
          content:
            `Search X for what real people are saying right now about: ${topic}. ` +
            "Then report as strict JSON only, schema: " +
            '{"summary": string (one plain sentence: what the conversation IS), ' +
            '"volume": "quiet"|"steady"|"loud"|"exploding", ' +
            '"voices": [{"text": string (the post, lightly trimmed), "mood": string (one word), "theme": string}]}. ' +
            "4-8 voices, chosen for representativeness not virality. No prose outside the JSON.",
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`xAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const { text, citations } = extractResponse(await res.json());
  const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const gather = JSON.parse(jsonText) as GrokGather;

  console.log(
    `[grok-voices] gathered ${gather.voices?.length ?? 0} voices for ${sit.id} ` +
      `(${citations.length} citations; gather ${gathersToday}/${GATHERS_PER_DAY} today)`,
  );
  return toSignals(gather, citations, sit, now);
}

function toSignals(g: GrokGather, citations: string[], sit: Situation, now: Date): NormalizedSignal[] {
  const nowIso = now.toISOString();
  const volumeScore = { quiet: 0.2, steady: 0.5, loud: 0.8, exploding: 1 }[g.volume] ?? 0.5;
  const voiceLines = (g.voices ?? [])
    .slice(0, 8)
    .map((v) => `- [${v.mood}/${v.theme}] "${v.text}"`)
    .join("\n");
  return [
    {
      id: `grok-x:${sit.id}:${nowIso}`,
      sourceId: "grok-x",
      dimension: "narrative",
      observedAt: nowIso,
      windowStart: nowIso,
      windowEnd: nowIso,
      entityKeys: sit.entityKeys,
      metric: { name: "x_volume", value: volumeScore, unit: "index" },
      text: `live X conversation — ${g.summary} (volume: ${g.volume})\n${voiceLines}`,
      rawRef: citations.slice(0, 6).join(" "),
    },
  ];
}
