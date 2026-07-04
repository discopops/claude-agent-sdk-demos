import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedSignal } from "../types.ts";
import { resolveEntityKeys } from "../resolve/entities.ts";
import { makeDelta, type PollContext, type SourceAdapter } from "./types.ts";

const FIXTURE_DIR = resolve(import.meta.dir, "../../fixtures/x");

interface XTopic {
  topic: string;
  entityKeys?: string[];
  geo?: { country?: string };
  mentions: number;
  prevMentions: number;
  sampleTexts: string[];
}

/**
 * X source. MCP-ready seam, but runs on mock fixtures by default: new X
 * accounts are pay-per-use with no free tier and the hosted-MCP OAuth flow
 * can't complete non-interactively. Phase 3 swaps poll() for api.x.com/mcp
 * while keeping this exact NormalizedSignal output.
 */
export const xAdapter: SourceAdapter = {
  id: "x",
  dimension: "narrative",
  mode: "mock",
  capabilities: { geo: true, conviction: false, entities: true },

  async poll(ctx: PollContext): Promise<NormalizedSignal[]> {
    const nowIso = ctx.now.toISOString();
    const windowStart = new Date(ctx.now.getTime() - ctx.windowMinutes * 60_000).toISOString();
    const signals: NormalizedSignal[] = [];

    for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))) {
      const payload = JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), "utf8"));
      for (const t of (payload.topics ?? []) as XTopic[]) {
        const keys = new Set<string>(t.entityKeys ?? []);
        for (const k of resolveEntityKeys(t.topic)) keys.add(k);
        if (keys.size === 0) continue;
        signals.push({
          id: `x:${t.topic}:${nowIso}`,
          sourceId: "x",
          dimension: "narrative",
          observedAt: nowIso,
          windowStart,
          windowEnd: nowIso,
          entityKeys: [...keys],
          geo: t.geo,
          metric: { name: "mentions", value: t.mentions, unit: "posts" },
          delta: makeDelta(t.prevMentions, t.mentions, ctx.windowMinutes),
          text: t.sampleTexts.slice(0, 6).join("\n"),
          rawRef: `${file}#${t.topic}`,
        });
      }
    }
    return signals;
  },

  health() {
    return { ok: true, mode: this.mode };
  },
};
