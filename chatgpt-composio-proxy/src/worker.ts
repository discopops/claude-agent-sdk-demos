/**
 * Cloudflare Worker: Composio Tool Router Proxy for ChatGPT
 *
 * This worker provides a stable, permanent URL for ChatGPT to reach your
 * Composio tool router session — no more changing ngrok URLs.
 *
 * Environment variables (set via `wrangler secret put` or the dashboard):
 *   COMPOSIO_BASE_URL  - The base URL of the Composio tool router
 *                        e.g. "https://mcp.composio.dev"
 *   COMPOSIO_TOKEN     - Your Composio session token
 *                        e.g. "bace46d907393d79e50d083f6a79c04e1b0d2e8b89c68bc2"
 */

export interface Env {
  COMPOSIO_BASE_URL: string;
  COMPOSIO_TOKEN: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!env.COMPOSIO_BASE_URL || !env.COMPOSIO_TOKEN) {
      return new Response(
        JSON.stringify({
          error:
            "Worker not configured. Set COMPOSIO_BASE_URL and COMPOSIO_TOKEN secrets.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // Build the target URL: swap the host, keep path + query string
    const incomingUrl = new URL(request.url);
    const baseUrl = env.COMPOSIO_BASE_URL.replace(/\/$/, "");
    const targetUrl = new URL(
      incomingUrl.pathname + incomingUrl.search,
      baseUrl
    );

    // Append the session token as a query param (mirrors the ngrok setup)
    // Skip if it's already present in the incoming request
    if (!targetUrl.searchParams.has("token")) {
      targetUrl.searchParams.set("token", env.COMPOSIO_TOKEN);
    }

    // Forward the request, stripping Cloudflare-specific / host headers
    const headersToForward = new Headers();
    for (const [key, value] of request.headers.entries()) {
      const lower = key.toLowerCase();
      // Drop headers that shouldn't be forwarded
      if (
        lower === "host" ||
        lower === "cf-connecting-ip" ||
        lower === "cf-ipcountry" ||
        lower === "cf-ray" ||
        lower === "cf-visitor" ||
        lower.startsWith("cf-")
      ) {
        continue;
      }
      headersToForward.set(key, value);
    }

    // Add Bearer auth as well, in case Composio prefers that over query param
    headersToForward.set("Authorization", `Bearer ${env.COMPOSIO_TOKEN}`);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: headersToForward,
        body:
          request.method !== "GET" && request.method !== "HEAD"
            ? request.body
            : null,
        // Required to stream request body through
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

    // Stream the upstream response back, adding CORS headers
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
