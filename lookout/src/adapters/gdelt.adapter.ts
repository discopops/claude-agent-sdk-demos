import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedSignal } from "../types.ts";
import { getProfile } from "../profile/profile.ts";
import { resolveEntityKeys } from "../resolve/entities.ts";
import { makeDelta, type PollContext, type SourceAdapter } from "./types.ts";

const BASE = process.env.GDELT_BASE_URL ?? "https://api.gdeltproject.org/api/v2/doc/doc";
const FIXTURE_DIR = resolve(import.meta.dir, "../../fixtures/gdelt");

interface Bucket {
  entityKeys: string[];
  geo?: { country?: string };
  coverage: number;
  prevCoverage: number;
  sampleTitles: string[];
}

interface GdeltArticle {
  title?: string;
  url?: string;
  sourcecountry?: string;
}

function fixtureBuckets(): Bucket[] {
  const out: Bucket[] = [];
  for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))) {
    const payload = JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), "utf8"));
    out.push(...((payload.buckets ?? []) as Bucket[]));
  }
  return out;
}

/** Bucket live GDELT articles by the known entities their headlines mention. */
function bucketArticles(articles: GdeltArticle[]): Bucket[] {
  const byKey = new Map<string, Bucket>();
  for (const a of articles) {
    if (!a.title) continue;
    for (const key of resolveEntityKeys(a.title)) {
      const b =
        byKey.get(key) ??
        byKey.set(key, { entityKeys: [key], coverage: 0, prevCoverage: 0, sampleTitles: [] }).get(key)!;
      b.coverage += 1;
      if (b.sampleTitles.length < 4) b.sampleTitles.push(a.title);
      if (a.sourcecountry && !b.geo) b.geo = { country: a.sourcecountry };
    }
  }
  return [...byKey.values()];
}

function normalize(buckets: Bucket[], ctx: PollContext): NormalizedSignal[] {
  const nowIso = ctx.now.toISOString();
  const windowStart = new Date(ctx.now.getTime() - ctx.windowMinutes * 60_000).toISOString();
  const signals: NormalizedSignal[] = [];
  for (const b of buckets) {
    const keys = new Set<string>(b.entityKeys ?? []);
    for (const t of b.sampleTitles) for (const k of resolveEntityKeys(t)) keys.add(k);
    if (keys.size === 0) continue;
    signals.push({
      id: `gdelt:${[...keys].join("+")}:${nowIso}`,
      sourceId: "gdelt",
      dimension: "events",
      observedAt: nowIso,
      windowStart,
      windowEnd: nowIso,
      entityKeys: [...keys],
      geo: b.geo,
      metric: { name: "coverage", value: b.coverage, unit: "articles" },
      delta: b.prevCoverage ? makeDelta(b.prevCoverage, b.coverage, ctx.windowMinutes) : undefined,
      text: `News coverage (${b.coverage} articles):\n` + b.sampleTitles.slice(0, 4).join("\n"),
      rawRef: `gdelt:${[...keys].join("+")}`,
    });
  }
  return signals;
}

/**
 * GDELT — free, global, multilingual news-event coverage, georeferenced and
 * updated every 15 min. Ground-truth dimension: what the world's press is
 * actually reporting, and where. Tries the live DOC API; degrades to fixtures.
 * The first drop-in "follow-on" source — nothing downstream changed to add it.
 */
export const gdeltAdapter: SourceAdapter & { _mode: "live" | "mock"; _lastError?: string } = {
  id: "gdelt",
  dimension: "events",
  mode: "live",
  capabilities: { geo: true, conviction: false, entities: true },
  _mode: "live",
  _lastError: undefined,

  async poll(ctx: PollContext): Promise<NormalizedSignal[]> {
    const terms = [
      ...getProfile().entities.map((e) => `"${e.key.replace(/-/g, " ")}"`),
      ...getProfile().interests.slice(0, 3).map((i) => `"${i.topic.split(" ").slice(0, 2).join(" ")}"`),
    ].slice(0, 8);
    const query = `(${terms.join(" OR ")})`;
    const url = `${BASE}?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=75&timespan=1d&format=json&sort=hybridrel`;
    try {
      // GDELT's DOC API routinely takes 8-10s; an 8s abort trips even on valid responses. 15s.
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { articles?: GdeltArticle[] };
      this._mode = "live";
      this._lastError = undefined;
      return normalize(bucketArticles(body.articles ?? []), ctx);
    } catch (err) {
      this._mode = "mock";
      this._lastError = (err as Error).message;
      return normalize(fixtureBuckets(), ctx);
    }
  },

  health() {
    return { ok: true, mode: this._mode, lastError: this._lastError };
  },
};
