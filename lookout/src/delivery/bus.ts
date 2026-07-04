import type { Routed } from "../salience/router.ts";
import type { Interpretation } from "../interpret/schema.ts";

// A tiny in-process pub/sub so the scheduler can emit results and any number of
// consumers (the console printer, the WebSocket server) can react — without the
// scheduler knowing who is listening.

export interface CardEvent {
  type: "card";
  ts: string;
  tick: number;
  situationId: string;
  title: string;
  entityKeys: string[];
  activeSources: string[];
  salience: Routed;
  interpretation: Interpretation | null;
  /** trimmed raw signals so the client can render receipts (trend chips etc.) */
  signals: { sourceId: string; text: string; value: number; unit: string; geo: string | null }[];
}

export interface InterruptEvent {
  type: "interrupt";
  ts: string;
  situationId: string;
  title: string;
  text: string; // the spoken line
}

export interface TickEvent {
  type: "tick";
  ts: string;
  tick: number;
  health: { id: string; mode: string; ok: boolean }[];
}

export interface ActivityEvent {
  type: "activity";
  ts: string;
  situationId: string;
  stage: string; // deep-pass stage: narrative | market | skeptic | synthesizing | done
}

export interface TrackEvent {
  type: "track";
  ts: string;
  points: number;
  meanAbsGap: number;
  divergences: number;
  // Brier scorecard on settled markets (null until any market resolves).
  scored: number;
  aiBrier: number | null;
  marketBrier: number | null;
  aiBetter: boolean | null;
}

export interface BriefEvent {
  type: "brief";
  ts: string;
  label: string; // e.g. "Morning brief" or "On-demand brief"
  text: string; // the spoken brief
  items: { title: string; line: string }[];
}

export type LookoutEvent =
  | CardEvent
  | InterruptEvent
  | TickEvent
  | ActivityEvent
  | TrackEvent
  | BriefEvent;

type Listener = (e: LookoutEvent) => void;

const listeners = new Set<Listener>();
const RING_MAX = 100;
const ring: LookoutEvent[] = [];

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Recent events, so a client that connects mid-stream sees the current board. */
export function recentEvents(): LookoutEvent[] {
  return ring.slice();
}

export function publish(e: LookoutEvent) {
  ring.push(e);
  if (ring.length > RING_MAX) ring.shift();
  for (const fn of listeners) {
    try {
      fn(e);
    } catch (err) {
      console.error("[bus] listener error:", (err as Error).message);
    }
  }
}
