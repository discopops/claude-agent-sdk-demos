import type { NormalizedSignal } from "../types.ts";
import type { PollContext, SourceAdapter } from "./types.ts";
import { kalshiAdapter } from "./kalshi.adapter.ts";
import { xAdapter } from "./x.adapter.ts";
import { trendsAdapter } from "./trends.adapter.ts";
import { gdeltAdapter } from "./gdelt.adapter.ts";

// Source set. Adding a source = push one adapter here; nothing downstream
// changes because everything speaks NormalizedSignal.
//
// GDELT is a follow-on source (geographic ground truth) and deliberately OPT-IN:
// the core bet is interpretation over aggregation — fewer sources, deeper
// reasoning — so breadth has to be chosen, not accumulated by default.
// Set LOOKOUT_ENABLE_GDELT=1 to register it.
export const adapters: SourceAdapter[] = [
  kalshiAdapter,
  xAdapter,
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
