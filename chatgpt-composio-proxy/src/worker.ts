/**
 * Cloudflare Worker: Composio Tool Router Proxy for ChatGPT
 *
 * Provides a stable, permanent URL for ChatGPT to reach your Composio
 * tool router MCP session — no more changing ngrok URLs.
 *
 * Secrets (set via `wrangler secret put`):
 *   COMPOSIO_MCP_URL  - Full MCP endpoint URL for your tool router session
 *                       e.g. "https://backend.composio.dev/tool_router/trs_xxx/mcp"
 *   COMPOSIO_API_KEY  - Your Composio API key (sent as x-api-key header)
 *                       e.g. "ak_VlilJc5UvTJGk8bAROPb"
 */

export interface Env {
  COMPOSIO_MCP_URL: string;
  COMPOSIO_API_KEY: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, x-api-key",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!env.COMPOSIO_MCP_URL || !env.COMPOSIO_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Worker not configured. Set COMPOSIO_MCP_URL and COMPOSIO_API_KEY secrets.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // Always proxy to the configured MCP URL — append any path/query from
    // the incoming request so sub-paths (e.g. /sse, /messages) still work.
    const incomingUrl = new URL(request.url);
    const targetBase = env.COMPOSIO_MCP_URL.replace(/\/$/, "");
    const targetUrl = new URL(targetBase);

    // Append any extra path segments (e.g. /sse, /messages)
    if (incomingUrl.pathname !== "/") {
      targetUrl.pathname = targetUrl.pathname.replace(/\/$/, "") + incomingUrl.pathname;
    }
    // Preserve any query params from ChatGPT
    for (const [key, value] of incomingUrl.searchParams.entries()) {
      targetUrl.searchParams.set(key, value);
    }

    // Build forwarded headers, dropping Cloudflare internals
    const headersToForward = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (key.toLowerCase() === "host" || key.toLowerCase().startsWith("cf-")) {
        continue;
      }
      headersToForward.set(key, value);
    }

    // Composio authenticates via x-api-key header
    headersToForward.set("x-api-key", env.COMPOSIO_API_KEY);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: headersToForward,
        body:
          request.method !== "GET" && request.method !== "HEAD"
            ? request.body
            : null,
        duplex: "half",
      } as RequestInit);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: "Failed to reach Composio", detail: message }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // Pass the response back with CORS headers added
    const responseHeaders = new Headers(upstreamResponse.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(key, value);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};
