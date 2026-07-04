import { z } from "zod";

// The Interpretation is the product unit — a small analytic brief, not a data
// point. This is what makes Lookout an analyst rather than a feed.

export const CrowdMindState = z.object({
  moods: z.array(z.string()).describe("motivation + emotional undercurrent, e.g. fear, opportunism, outrage, resignation, euphoria, fatigue — NOT sentiment polarity"),
  intensity: z.number().min(0).max(1).describe("how charged the mood is, 0..1"),
  drivers: z.string().describe("WHY the crowd feels this way, grounded in the signals"),
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
  gap: z.number().describe("aiProb - marketProb (recomputed in code)"),
  read: z.string().describe("what the gap means: edge (AI sees what market hasn't) vs over-read"),
});

export const Interpretation = z.object({
  whatsHappening: z.string().describe("plain-language read of the raw signal, grounded"),
  crowdMindState: CrowdMindState,
  likelyActions: z.array(LikelyAction),
  marketCalibration: z.array(MarketCalibration).default([]),
  soWhat: z.string().describe("why THIS user cares, tied to their profile"),
  confidence: z.number().min(0).max(1),
  falsifiers: z.array(z.string()).describe("what would change this read"),
  grounding: z.array(z.string()).describe("which signals/sources this rests on"),
  unconfirmed: z.boolean().describe("true if the read rests on a single source"),
});

export type Interpretation = z.infer<typeof Interpretation>;

// Hand-authored JSON Schema for the forced tool input (zod v3 has no native
// JSON-schema export; kept in sync with the zod object above).
export const interpretationToolSchema = {
  type: "object",
  properties: {
    whatsHappening: { type: "string" },
    crowdMindState: {
      type: "object",
      properties: {
        moods: { type: "array", items: { type: "string" } },
        intensity: { type: "number" },
        drivers: { type: "string" },
      },
      required: ["moods", "intensity", "drivers"],
    },
    likelyActions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string" },
          probability: { type: "number" },
          horizon: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["action", "probability", "horizon", "rationale"],
      },
    },
    marketCalibration: {
      type: "array",
      items: {
        type: "object",
        properties: {
          marketRef: { type: "string" },
          marketProb: { type: "number" },
          aiProb: { type: "number" },
          gap: { type: "number" },
          read: { type: "string" },
        },
        required: ["marketRef", "marketProb", "aiProb", "read"],
      },
    },
    soWhat: { type: "string" },
    confidence: { type: "number" },
    falsifiers: { type: "array", items: { type: "string" } },
    grounding: { type: "array", items: { type: "string" } },
    unconfirmed: { type: "boolean" },
  },
  required: [
    "whatsHappening", "crowdMindState", "likelyActions",
    "soWhat", "confidence", "falsifiers", "grounding", "unconfirmed",
  ],
} as const;
