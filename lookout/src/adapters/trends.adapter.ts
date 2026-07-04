import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedSignal } from "../types.ts";
import { resolveEntityKeys } from "../resolve/entities.ts";
import { makeDelta, type PollContext, type SourceAdapter } from "./types.ts";

const FIXTURE_DIR = resolve(import.meta.dir, "../../fixtures/trends");

interface TrendQuery {
  query: string;
  entityKeys?: string[];
  geo?: { country?: string };
  interest: number;
  prevInterest: number;
}

/**
 * Google Trends: the attention tripwire (cheapest, earliest, geographic). No
 * official API exists, so v1 runs mock fixtures; live is best-effort with the
 * same fallback. Attention, not truth — it triggers the deeper layers.
 */
export const trendsAdapter: SourceAdapter = {
  id: "trends",
  dimension: "attention",
  mode: (process.env.LOOKOUT_TRENDS_MODE as "live" | "mock") ?? "mock",
  capabilities: { geo: true, conviction: false, entities: false },

  async poll(ctx: PollContext): Promise<NormalizedSignal[]> {
    const nowIso = ctx.now.toISOString();
    const windowStart = new Date(ctx.now.getTime() - ctx.windowMinutes * 60_000).toISOString();
    const signals: NormalizedSignal[] = [];

    for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))) {
      const payload = JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), "utf8"));
      for (const q of (payload.queries ?? []) as TrendQuery[]) {
        const keys = new Set<string>(q.entityKeys ?? []);
        for (const k of resolveEntityKeys(q.query)) keys.add(k);
        if (keys.size === 0) continue;
        signals.push({
          id: `trends:${q.query}:${nowIso}`,
          sourceId: "trends",
          dimension: "attention",
          observedAt: nowIso,
          windowStart,
          windowEnd: nowIso,
          entityKeys: [...keys],
          geo: q.geo,
          metric: { name: "search_interest", value: q.interest, unit: "index" },
          delta: makeDelta(q.prevInterest, q.interest, ctx.windowMinutes),
          text: `rising search: "${q.query}"`,
          rawRef: `${file}#${q.query}`,
        });
      }
    }
    return signals;
  },

  health() {
    return { ok: true, mode: this.mode };
  },
};
