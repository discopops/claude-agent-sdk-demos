import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedSignal } from "../types.ts";
import { getProfile } from "../profile/profile.ts";
import { resolveEntityKeys, slugify } from "../resolve/entities.ts";
import { makeDelta, type PollContext, type SourceAdapter } from "./types.ts";

const FIXTURE_DIR = resolve(import.meta.dir, "../../fixtures/trends");
const RSS_BASE = process.env.LOOKOUT_TRENDS_RSS ?? "https://trends.google.com/trending/rss";
const CACHE_TTL_MS = 10 * 60_000; // trending updates ~hourly; don't hammer Google every tick
const MAX_ZEITGEIST = 12;
// Global coverage by default — the zeitgeist is not one country's. Profile
// regions are ADDED to this basket (they weight relevance; they don't limit reach).
const DEFAULT_GEOS = "US,GB,AU,CA,IN,DE,FR,BR,JP,MX";

interface TrendQuery {
  query: string;
  entityKeys?: string[];
  geo?: { country?: string };
  interest: number;
  prevInterest: number;
}

interface TrendingItem {
  query: string;
  traffic: number; // approx searches/day, parsed from "50,000+"
  headline?: string; // top news item Google associates with the trend
  geo: string;
}

const rssCache = new Map<string, { fetchedAt: number; items: TrendingItem[] }>();
const prevTraffic = new Map<string, number>(); // query slug -> last seen traffic

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseRss(xml: string, geo: string): TrendingItem[] {
  const items: TrendingItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]!;
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
    if (!title) continue;
    const traffic = block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/)?.[1] ?? "0";
    const headline = block.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/)?.[1]?.trim();
    items.push({
      query: decodeEntities(title),
      traffic: Number(traffic.replace(/[^0-9]/g, "")) || 0,
      headline: headline ? decodeEntities(headline) : undefined,
      geo,
    });
  }
  return items;
}

async function fetchTrending(geo: string): Promise<TrendingItem[]> {
  const cached = rssCache.get(geo);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.items;
  const res = await fetch(`${RSS_BASE}?geo=${encodeURIComponent(geo)}`, {
    headers: { Accept: "application/rss+xml" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseRss(await res.text(), geo);
  if (items.length === 0) throw new Error("RSS parsed to zero items");
  rssCache.set(geo, { fetchedAt: Date.now(), items });
  return items;
}

function liveSignals(items: TrendingItem[], ctx: PollContext): NormalizedSignal[] {
  const nowIso = ctx.now.toISOString();
  const windowStart = new Date(ctx.now.getTime() - ctx.windowMinutes * 60_000).toISOString();

  // Merge by query slug across regions: keep the highest-traffic sighting but
  // remember every country it trends in — breadth is itself signal.
  const bySlug = new Map<string, { it: TrendingItem; geos: Set<string> }>();
  for (const it of items) {
    const slug = slugify(it.query);
    const cur = bySlug.get(slug);
    if (!cur) bySlug.set(slug, { it, geos: new Set([it.geo]) });
    else {
      cur.geos.add(it.geo);
      if (it.traffic > cur.it.traffic) cur.it = it;
    }
  }

  const signals: NormalizedSignal[] = [];
  const zeitgeist: { slug: string; it: TrendingItem; geos: Set<string> }[] = [];

  for (const [slug, { it, geos }] of bySlug) {
    const matchText = `${it.query} ${it.headline ?? ""}`;
    const keys = resolveEntityKeys(matchText);
    if (keys.length > 0) {
      signals.push(toSignal(slug, it, geos, keys, nowIso, windowStart));
    } else {
      zeitgeist.push({ slug, it, geos });
    }
  }

  // Everything off-lens still IS the zeitgeist — what the world is searching
  // right now. One stable entity so it clusters into a single situation with
  // working memory/novelty, instead of being invented (mock) or dropped.
  // Rank: trending in many countries beats raw traffic in one.
  zeitgeist.sort((a, b) => b.geos.size - a.geos.size || b.it.traffic - a.it.traffic);
  for (const { slug, it, geos } of zeitgeist.slice(0, MAX_ZEITGEIST)) {
    signals.push(toSignal(slug, it, geos, ["zeitgeist"], nowIso, windowStart));
  }
  return signals;
}

function toSignal(
  slug: string,
  it: TrendingItem,
  geos: Set<string>,
  keys: string[],
  nowIso: string,
  windowStart: string,
): NormalizedSignal {
  // A query on the trending feed IS a surge by definition — Google just doesn't
  // give us the pre-surge number. First sighting encodes that as +100% so cold
  // velocity reflects reality instead of reading 0 until baselines warm.
  const prev = prevTraffic.get(slug) ?? Math.max(1, Math.round(it.traffic / 2));
  prevTraffic.set(slug, it.traffic);
  const where = [...geos].sort().join(",");
  return {
    id: `trends:${slug}:${nowIso}`,
    sourceId: "trends",
    dimension: "attention",
    observedAt: nowIso,
    windowStart,
    windowEnd: nowIso,
    entityKeys: keys,
    geo: { country: it.geo },
    // per-query metric name so each trend keeps its own baseline inside a situation
    metric: { name: `traffic:${slug}`, value: it.traffic, unit: "searches" },
    delta: prev !== it.traffic ? makeDelta(prev, it.traffic, 60) : undefined,
    text:
      `trending search: "${it.query}" (~${it.traffic.toLocaleString()}+ searches; trending in ${where})` +
      (it.headline ? `\nin the news: ${it.headline}` : ""),
    rawRef: `trends:${where}:${slug}`,
  };
}

function fixtureSignals(ctx: PollContext): NormalizedSignal[] {
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
}

/**
 * Google Trends: the attention tripwire (cheapest, earliest, geographic).
 * LIVE by default via the public trending-now RSS feed (no key), fetched per
 * profile region and cached 10 min. Queries that resolve to lens entities join
 * their situations; the rest — the actual global zeitgeist — cluster into one
 * "zeitgeist" situation. Degrades to fixtures on any failure; force mock with
 * LOOKOUT_TRENDS_MODE=mock. Attention, not truth — it triggers deeper layers.
 */
export const trendsAdapter: SourceAdapter & { _mode: "live" | "mock"; _lastError?: string } = {
  id: "trends",
  dimension: "attention",
  mode: "live",
  capabilities: { geo: true, conviction: false, entities: false },
  _mode: "live",
  _lastError: undefined,

  async poll(ctx: PollContext): Promise<NormalizedSignal[]> {
    if (process.env.LOOKOUT_TRENDS_MODE === "mock") {
      this._mode = "mock";
      return fixtureSignals(ctx);
    }
    try {
      const basket = (process.env.LOOKOUT_TRENDS_GEOS ?? DEFAULT_GEOS).split(",").map((s) => s.trim()).filter(Boolean);
      const regional = getProfile().regions.map((r) => r.geo?.country).filter((c): c is string => !!c);
      const geos = [...new Set([...basket, ...regional])];
      const results = await Promise.allSettled(geos.map(fetchTrending));
      const items = results.filter((r): r is PromiseFulfilledResult<TrendingItem[]> => r.status === "fulfilled").flatMap((r) => r.value);
      if (items.length === 0) throw new Error("all trend regions failed");
      this._mode = "live";
      this._lastError = undefined;
      return liveSignals(items, ctx);
    } catch (err) {
      this._mode = "mock";
      this._lastError = (err as Error).message;
      return fixtureSignals(ctx);
    }
  },

  health() {
    return { ok: true, mode: this._mode, lastError: this._lastError };
  },
};
