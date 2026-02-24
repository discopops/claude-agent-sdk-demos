# ChatGPT ↔ Composio Proxy (Cloudflare Worker)

A lightweight Cloudflare Worker that gives you a **permanent, stable URL** to connect ChatGPT to your Composio tool router session — no more changing ngrok URLs.

```
ChatGPT  →  https://chatgpt-composio-proxy.<you>.workers.dev  →  Composio MCP
                     (stable, never changes)
```

## How it works

- Proxies all requests from ChatGPT to your Composio tool router MCP endpoint.
- Auth is handled via the `x-api-key` header (matches Composio's requirement).
- CORS is handled automatically.
- Sub-paths like `/sse` and `/messages` are forwarded correctly.

---

## One-time setup (run on your local machine)

### 1. Install dependencies

```bash
cd chatgpt-composio-proxy
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

### 3. Set your secrets

```bash
npx wrangler secret put COMPOSIO_MCP_URL
# When prompted, enter:
# https://backend.composio.dev/tool_router/trs_irUL30NXDyMS/mcp

npx wrangler secret put COMPOSIO_API_KEY
# When prompted, enter your Composio API key:
# ak_VlilJc5UvTJGk8bAROPb
```

### 4. Deploy

```bash
npm run deploy
```

Output will include your permanent URL:

```
✅ Deployed to: https://chatgpt-composio-proxy.<your-subdomain>.workers.dev
```

Use that URL in ChatGPT — it never changes.

---

## When you create a new Composio session

Just update the MCP URL secret and redeploy — your ChatGPT URL stays the same:

```bash
npx wrangler secret put COMPOSIO_MCP_URL
# Enter the new URL: https://backend.composio.dev/tool_router/trs_NEW_ID/mcp
npm run deploy
```

---

## Local development

```bash
cp .dev.vars.example .dev.vars
# Fill in .dev.vars with your real values
npm run dev
# Worker runs at http://localhost:8787
```

## View live logs

```bash
npm run tail
```
