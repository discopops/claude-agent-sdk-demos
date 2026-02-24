# ChatGPT ↔ Composio Proxy (Cloudflare Worker)

A lightweight Cloudflare Worker that gives you a **permanent, stable URL** to connect ChatGPT to your Composio tool router — no more changing ngrok URLs.

```
ChatGPT  →  https://chatgpt-composio-proxy.<you>.workers.dev  →  Composio
                     (stable, never changes)
```

## How it works

- The Worker proxies all requests from ChatGPT to your Composio tool router endpoint.
- Your Composio session token is stored as a Cloudflare secret — not in the URL.
- CORS is handled automatically so ChatGPT can call the API from the browser.

---

## One-time setup (deploy from your local machine)

### 1. Install dependencies

```bash
cd chatgpt-composio-proxy
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser to authenticate. You only need to do this once.

### 3. Set your secrets

```bash
# The base URL of the Composio tool router (no trailing slash)
npx wrangler secret put COMPOSIO_BASE_URL
# When prompted, enter:  https://mcp.composio.dev
# (or whatever your Composio endpoint is)

# Your Composio session token
npx wrangler secret put COMPOSIO_TOKEN
# When prompted, paste your token:
# e.g.  bace46d907393d79e50d083f6a79c04e1b0d2e8b89c68bc2
```

### 4. Deploy

```bash
npm run deploy
```

You'll see output like:

```
✅ Successfully deployed to:
   https://chatgpt-composio-proxy.<your-subdomain>.workers.dev
```

**That URL never changes.** Copy it — this is what you put in ChatGPT.

---

## Updating your Composio token

When you generate a new Composio session, just update the secret and redeploy:

```bash
npx wrangler secret put COMPOSIO_TOKEN
npm run deploy
```

---

## Configuring ChatGPT

In your Custom GPT (or wherever you previously pasted the ngrok URL), use:

```
https://chatgpt-composio-proxy.<your-subdomain>.workers.dev
```

The worker automatically appends the `?token=` query parameter and the
`Authorization: Bearer` header to every request it forwards to Composio.

---

## Local development

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your real values
npm run dev
```

The worker runs at `http://localhost:8787`.

---

## Viewing logs

```bash
npm run tail
```

This streams live request logs from the deployed worker.
