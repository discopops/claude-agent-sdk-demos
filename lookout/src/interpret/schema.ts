import { z } from "zod";

// The Interpretation is the product unit — a small analytic brief, not a data
// point. This is what makes Lookout an analyst rather than a feed.

export const CrowdMindState = z.object({
  moods: z.array(z.string()).describe("motivation + emotional undercurrent in plain words, e.g. worried, fed up, excited, over it — NOT sentiment polarity"),
  intensity: z.number().min(0).max(1).describe("how charged the mood is, 0..1"),
  drivers: z.string().describe("WHY people feel this way, grounded in the signals, one plain sentence"),
  evidence: z
    .array(z.string())
    .default([])
    .describe("2-4 short verbatim snippets (searches, posts, headlines) that SHOW the mood — receipts, not summaries"),
});

export const MoneyAngle = z.object({
  angle: z.string().describe("the opportunity in one plain phrase, e.g. 'market underpricing X', 'demand spike for Y', 'lock in Z before it rises'"),
  thesis: z.string().describe("one or two plain sentences: why the signal suggests money can be made or saved here"),
  horizon: z.string().describe("rough window, e.g. 'this week', 'before the announcement'"),
  confidence: z.number().min(0).max(1),
});

export const LikelyAction = z.object({
  action: z.string().describe("a concrete mass behaviour people are likely to take"),
  probability: z.number().min(0).max(1),
  horizon: z.string().describe("rough timeframe, e.g. 'days', 'this week', 'before the meeting'"),
  rationale: z.string(),
});

export const MarketCalibration = z.object({
  marketRef: z.string().describe("Kalshi ticker or market title this checks against"),
  marketProb: z.number().min(0).max(1).describe("market-implied probability (from data)"),
  aiProb: z.number().min(0).max(1).describe("the AI's own probability for the same outcome"),
  // Always recomputed deterministically in calibrate(); defaulted so a model
  // omission can never fail the whole interpretation validation.
  gap: z.number().default(0).describe("aiProb - marketProb (recomputed in code)"),
  read: z.string().describe("what the gap means: edge (AI sees what market hasn't) vs over-read"),
});

export const Interpretation = z.object({
  whatsHappening: z.string().describe("plain-language read of the raw signal, grounded"),
  crowdMindState: CrowdMindState,
  likelyActions: z.array(LikelyAction),
  marketCalibration: z.array(MarketCalibration).default([]),
  moneyAngles: z
    .array(MoneyAngle)
    .default([])
    .describe("opportunities to make or save money the signal genuinely suggests — market gaps, demand spikes, timing moves. Empty is the default; never force one"),
  soWhat: z.string().describe("why THIS user cares, tied to their profile"),
  confidence: z.number().min(0).max(1),
  falsifiers: z.array(z.string()).describe("what would change this read"),
  grounding: z.array(z.string()).describe("which signals/sources this rests on"),
  unconfirmed: z.boolean().describe("true if the read rests on a single source"),
  // Self-correction (set when a prior read of this situation exists):
  change: z
    .string()
    .default("")
    .describe("what changed vs. your previous read of this situation; empty if first read or unchanged"),
  wasWrong: z
    .boolean()
    .default(false)
    .describe("true if your previous read has been contradicted by newer signal/market movement — own it"),
  // Set in code (quick single-pass vs deep multi-agent), not by the model.
  depth: z.enum(["quick", "deep"]).default("quick"),
});

export type Interpretation = z.infer<typeof Interpretation>;
