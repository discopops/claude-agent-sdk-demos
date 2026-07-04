import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedSignal } from "../types.ts";
import { resolveEntityKeys } from "../resolve/entities.ts";
import { makeDelta, type PollContext, type SourceAdapter } from "./types.ts";

const BASE = process.env.KALSHI_BASE_URL ?? "https://external-api.kalshi.com/trade-api/v2";
const FIXTURE_DIR = resolve(import.meta.dir, "../../fixtures/kalshi");

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  last_price?: number; // cents 0-100
  previous_price?: number; // cents
  volume?: number;
  volume_24h?: number;
  open_interest?: number;
  status?: string;
}

/** log-scaled 0..1 weight from trade volume (~1.0 at 100k). */
function volumeWeight(vol: number): number {
  return Math.min(1, Math.log10(vol + 1) / 5);
}

function normalizeMarkets(markets: KalshiMarket[], ctx: PollContext): NormalizedSignal[] {
  const nowIso = ctx.now.toISOString();
  const windowStart = new Date(ctx.now.getTime() - ctx.windowMinutes * 60_000).toISOString();
  const signals: NormalizedSignal[] = [];
  for (const m of markets) {
    const title = `${m.title ?? ""} ${m.yes_sub_title ?? m.subtitle ?? ""}`.trim();
    const keys = resolveEntityKeys(title);
    if (keys.length === 0) continue; // only ingest markets that map to a known entity — keeps it focused + convergent

    const last = m.last_price ?? 50;
    const prev = m.previous_price ?? last;
    const impliedProb = last / 100;
    const priceMove = Math.abs(last - prev) / 100;
    const vol = m.volume_24h ?? m.volume ?? 0;
    const conviction = Math.min(1, priceMove * 4 * volumeWeight(vol) + 0.15 * volumeWeight(vol));

    signals.push({
      id: `kalshi:${m.ticker}:${nowIso}`,
      sourceId: "kalshi",
      dimension: "conviction",
      observedAt: nowIso,
      windowStart,
      windowEnd: nowIso,
      entityKeys: keys,
      metric: { name: "implied_prob", value: impliedProb, unit: "prob" },
      delta: makeDelta(prev / 100, impliedProb, ctx.windowMinutes),
      conviction,
      text: `Market "${title}": ${(impliedProb * 100).toFixed(0)}% (${priceMove > 0 ? `${prev}→${last}c, ` : ""}vol ${vol.toLocaleString()})`,
      url: `https://kalshi.com/markets/${m.ticker}`,
      rawRef: m.ticker,
    });
  }
  return signals;
}

function loadFixtureMarkets(): KalshiMarket[] {
  const markets: KalshiMarket[] = [];
  for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))) {
    const payload = JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), "utf8"));
    markets.push(...((payload.markets ?? []) as KalshiMarket[]));
  }
  return markets;
}

/**
 * Kalshi — LIVE and free (public read, no auth). In Lookout it is NOT a third
 * feed: it is the reality-check on the AI's predictions. Emits conviction
 * signals (implied probability + a conviction score = |price move| x volume)
 * that the interpretation engine calibrates its read against.
 *
 * Tries the live public API first; if egress policy or the network blocks it,
 * degrades to fixtures so the loop still runs — and returns to live
 * automatically when the endpoint is reachable.
 */
export const kalshiAdapter: SourceAdapter & { _mode: "live" | "mock"; _lastError?: string } = {
  id: "kalshi",
  dimension: "conviction",
  mode: "live",
  capabilities: { geo: false, conviction: true, entities: true },
  _mode: "live",
  _lastError: undefined,

  async poll(ctx: PollContext): Promise<NormalizedSignal[]> {
    try {
      const res = await fetch(`${BASE}/markets?limit=200&status=open`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { markets?: KalshiMarket[] };
      this._mode = "live";
      this._lastError = undefined;
      return normalizeMarkets(body.markets ?? [], ctx);
    } catch (err) {
      this._mode = "mock";
      this._lastError = (err as Error).message;
      return normalizeMarkets(loadFixtureMarkets(), ctx);
    }
  },

  health() {
    return { ok: true, mode: this._mode, lastError: this._lastError };
  },
};
