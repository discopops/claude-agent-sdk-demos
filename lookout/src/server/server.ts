import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerWebSocket } from "bun";
import { subscribe, recentEvents } from "../delivery/bus.ts";
import { applyFeedback } from "../profile/feedback.ts";
import type { FeedbackAction } from "../store/feedback.ts";

const CLIENT = resolve(import.meta.dir, "../../client/index.html");

/** Serve the dashboard + stream bus events over WebSocket + accept feedback. */
export function startServer(port = Number(process.env.LOOKOUT_PORT ?? 4317)) {
  const clients = new Set<ServerWebSocket<unknown>>();

  const server = Bun.serve({
    port,
    async fetch(req, srv) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        return srv.upgrade(req) ? undefined : new Response("upgrade failed", { status: 400 });
      }

      if (url.pathname === "/feedback" && req.method === "POST") {
        try {
          const { situationId, entityKeys, action } = (await req.json()) as {
            situationId: string;
            entityKeys: string[];
            action: FeedbackAction;
          };
          const delta = applyFeedback(situationId, entityKeys, action);
          console.log(`\x1b[36m[feedback]\x1b[0m ${action} ${situationId} ->`, delta);
          return Response.json({ ok: true, delta });
        } catch (err) {
          return Response.json({ ok: false, error: (err as Error).message }, { status: 400 });
        }
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(readFileSync(CLIENT, "utf8"), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      return new Response("not found", { status: 404 });
    },

    websocket: {
      open(ws) {
        clients.add(ws);
        for (const e of recentEvents()) ws.send(JSON.stringify(e)); // backfill current board
      },
      close(ws) {
        clients.delete(ws);
      },
      message() {
        /* client is receive-only; feedback goes over POST */
      },
    },
  });

  subscribe((e) => {
    const msg = JSON.stringify(e);
    for (const ws of clients) {
      try {
        ws.send(msg);
      } catch {
        /* drop */
      }
    }
  });

  console.log(`\x1b[36m[server]\x1b[0m dashboard on http://localhost:${port}`);
  return server;
}
