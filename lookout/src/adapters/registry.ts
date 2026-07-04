import type { NormalizedSignal } from "../types.ts";
import type { PollContext, SourceAdapter } from "./types.ts";
import { kalshiAdapter } from "./kalshi.adapter.ts";
import { xAdapter } from "./x.adapter.ts";
import { trendsAdapter } from "./trends.adapter.ts";

// v1 source set. Adding an OSINT source later = push one adapter here; nothing
// downstream changes because everything speaks NormalizedSignal.
export const adapters: SourceAdapter[] = [kalshiAdapter, xAdapter, trendsAdapter];

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
