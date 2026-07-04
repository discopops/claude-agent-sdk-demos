import type { NormalizedSignal } from "../types.ts";
import type { PollContext, SourceAdapter } from "./types.ts";
import { kalshiAdapter } from "./kalshi.adapter.ts";
import { xAdapter } from "./x.adapter.ts";
import { trendsAdapter } from "./trends.adapter.ts";
import { gdeltAdapter } from "./gdelt.adapter.ts";

// Source set. Adding a source = push one adapter here; nothing downstream
// changes because everything speaks NormalizedSignal.
//
// The default board is REAL DATA ONLY (Kalshi live + Trends live). Sources that
// would run on invented fixtures are opt-in:
// - X has no free tier, so without credentials it can only fabricate chatter.
//   It registers when configured live (X_MCP_URL + X_MCP_BEARER), or with
//   LOOKOUT_ENABLE_X_MOCK=1 for fixture demos.
// - GDELT (geographic ground truth) is a follow-on source — interpretation over
//   aggregation means breadth is chosen, not accumulated. LOOKOUT_ENABLE_GDELT=1.
const xConfigured = !!(process.env.X_MCP_URL && process.env.X_MCP_BEARER);
export const adapters: SourceAdapter[] = [
  kalshiAdapter,
  ...(xConfigured || process.env.LOOKOUT_ENABLE_X_MOCK === "1" ? [xAdapter] : []),
  trendsAdapter,
  ...(process.env.LOOKOUT_ENABLE_GDELT === "1" ? [gdeltAdapter] : []),
];

/** Number of registered sources — used to normalize cross-source convergence. */
export const SOURCE_COUNT = adapters.length;

/** Poll every adapter concurrently; a failing source degrades to [] and is reported, never fatal. */
export async function pollAll(ctx: PollContext): Promise<NormalizedSignal[]> {
  const results = await Promise.all(
    adapters.map(async (a) => {
      try {
        return await a.poll(ctx);
      } catch (err) {
        console.error(`[adapter:${a.id}] poll failed:`, (err as Error).message);
        return [] as NormalizedSignal[];
      }
    }),
  );
  return results.flat();
}

export function healthReport() {
  return adapters.map((a) => ({ id: a.id, ...a.health() }));
}
