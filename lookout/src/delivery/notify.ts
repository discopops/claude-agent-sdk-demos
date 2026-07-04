import { subscribe, type LookoutEvent } from "./bus.ts";

// Pluggable notification sinks for the things worth leaving the tab for —
// earned interrupts and briefs. Console is always on; a generic webhook (POST
// JSON) lets you fan out to Slack/Discord/push/SMS/email via your own relay.
// Add a channel by pushing to `channels`.

interface Notification {
  kind: "interrupt" | "brief";
  title: string;
  text: string;
  ts: string;
}

type Channel = (n: Notification) => void | Promise<void>;

const channels: Channel[] = [];

channels.push((n) => {
  const tag = n.kind === "interrupt" ? "\x1b[31m● INTERRUPT\x1b[0m" : "\x1b[36m▶ BRIEF\x1b[0m";
  console.log(`\n${tag} \x1b[1m${n.title}\x1b[0m\n  ${n.text}\n`);
});

if (process.env.LOOKOUT_NOTIFY_WEBHOOK) {
  const url = process.env.LOOKOUT_NOTIFY_WEBHOOK;
  channels.push(async (n) => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(n),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("[notify] webhook failed:", (err as Error).message);
    }
  });
}

function dispatch(n: Notification) {
  for (const ch of channels) {
    try {
      void ch(n);
    } catch (err) {
      console.error("[notify] channel error:", (err as Error).message);
    }
  }
}

/** Subscribe notifications to the event bus. Call once at startup. */
export function startNotifier() {
  const extra = process.env.LOOKOUT_NOTIFY_WEBHOOK ? " + webhook" : "";
  console.log(`\x1b[36m[notify]\x1b[0m channels: console${extra}`);
  subscribe((e: LookoutEvent) => {
    if (e.type === "interrupt") dispatch({ kind: "interrupt", title: e.title, text: e.text, ts: e.ts });
    else if (e.type === "brief") dispatch({ kind: "brief", title: e.label, text: e.text, ts: e.ts });
  });
}
