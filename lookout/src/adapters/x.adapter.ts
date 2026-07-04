import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedSignal } from "../types.ts";
import { resolveEntityKeys } from "../resolve/entities.ts";
import { getProfile } from "../profile/profile.ts";
import { makeDelta, type PollContext, type SourceAdapter } from "./types.ts";
import { type XTopic, xLiveConfigured, fetchLiveXTopics } from "./x-live.ts";

const FIXTURE_DIR = resolve(import.meta.dir, "../../fixtures/x");

function mockTopics(): XTopic[] {
  const topics: XTopic[] = [];
  for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))) {
    const payload = JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), "utf8"));
    topics.push(...((payload.topics ?? []) as XTopic[]));
  }
  return topics;
}

function normalize(topics: XTopic[], ctx: PollContext): NormalizedSignal[] {
  const nowIso = ctx.now.toISOString();
  const windowStart = new Date(ctx.now.getTime() - ctx.windowMinutes * 60_000).toISOString();
  const signals: NormalizedSignal[] = [];
  for (const t of topics) {
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
      text: (t.sampleTexts ?? []).slice(0, 6).join("\n"),
      rawRef: t.topic,
    });
  }
  return signals;
}

/**
 * X source. Runs on mock fixtures by default; when X_MCP_URL + X_MCP_BEARER are
 * set it pulls live discussion via the hosted X MCP (see x-live.ts) and degrades
 * back to fixtures on any error. New X accounts are pay-per-use with no free
 * tier and the OAuth flow can't complete non-interactively, so mock is the
 * default and the live path is untested in this environment.
 */
export const xAdapter: SourceAdapter & { _mode: "live" | "mock"; _lastError?: string } = {
  id: "x",
  dimension: "narrative",
  mode: "mock",
  capabilities: { geo: true, conviction: false, entities: true },
  _mode: "mock",
  _lastError: undefined,

  async poll(ctx: PollContext): Promise<NormalizedSignal[]> {
    if (xLiveConfigured()) {
      try {
        const hints = [
          ...getProfile().interests.map((i) => i.topic),
          ...getProfile().entities.map((e) => e.key),
        ];
        const topics = await fetchLiveXTopics(hints);
        this._mode = "live";
        this._lastError = undefined;
        return normalize(topics, ctx);
      } catch (err) {
        this._mode = "mock";
        this._lastError = (err as Error).message;
      }
    }
    return normalize(mockTopics(), ctx);
  },

  health() {
    return { ok: true, mode: this._mode, lastError: this._lastError };
  },
};
