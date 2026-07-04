import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordSettlement } from "../store/trackrecord.ts";

const BASE = process.env.KALSHI_BASE_URL ?? "https://external-api.kalshi.com/trade-api/v2";
const FIXTURE_DIR = resolve(import.meta.dir, "../../fixtures/kalshi-settled");

interface SettledMarket {
  ticker: string;
  result?: string; // "yes" | "no" | ""
}

/**
 * Ingest resolved-market outcomes so the calibration log can be Brier-scored.
 * Tries live Kalshi settled markets; degrades to fixtures (so the scorecard is
 * demonstrable without egress). Idempotent — settlements upsert by ticker.
 */
export async function ingestSettlements(): Promise<{ source: "live" | "mock"; count: number }> {
  const ts = new Date().toISOString();
  try {
    const res = await fetch(`${BASE}/markets?limit=500&status=settled`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { markets?: SettledMarket[] };
    let n = 0;
    for (const m of body.markets ?? []) {
      if (m.result === "yes" || m.result === "no") {
        recordSettlement(m.ticker, m.result === "yes" ? 1 : 0, ts);
        n++;
      }
    }
    return { source: "live", count: n };
  } catch {
    let n = 0;
    for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))) {
      const payload = JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), "utf8"));
      for (const s of (payload.settlements ?? []) as { ticker: string; outcome: 0 | 1 }[]) {
        recordSettlement(s.ticker, s.outcome, ts);
        n++;
      }
    }
    return { source: "mock", count: n };
  }
}
