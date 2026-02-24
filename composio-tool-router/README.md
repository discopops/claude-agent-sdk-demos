# Composio Tool Router + Claude Agent SDK

Connects the **Claude Agent SDK** to **Composio's Tool Router** via the Model
Context Protocol (MCP).  The Tool Router is a single MCP endpoint that
dynamically discovers and routes tool calls across 1 000+ app integrations
(GitHub, Gmail, Google Calendar, Slack, …) — no need to configure each
integration separately.

## How it works

```
Claude Agent SDK
      │
      │  mcpServers: { composio: { type, url, headers } }
      ▼
Composio Tool Router  (MCP endpoint)
      │
      ├── GitHub tools
      ├── Gmail tools
      ├── Google Calendar tools
      └── 1000+ more…
```

1. `Composio.create(userId, { toolkits })` creates a session and returns a
   secure MCP URL + auth headers.
2. The URL is passed to `query()` via `mcpServers`.
3. `allowedTools: ['mcp__composio__*']` gives Claude access to every tool the
   router surfaces for the current task.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env and fill in COMPOSIO_API_KEY, COMPOSIO_USER_ID, ANTHROPIC_API_KEY

# 3. Run
npm start
# or pass a custom prompt:
npx tsx composio-tool-router.ts "List my open GitHub issues"
```

## Environment variables

| Variable | Description |
|---|---|
| `COMPOSIO_API_KEY` | Your Composio API key — [app.composio.dev/settings](https://app.composio.dev/settings) |
| `COMPOSIO_USER_ID` | Stable identifier for the user whose connections the agent will use |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (used internally by the Claude Agent SDK) |

## Customising toolkits

Edit the `TOOLKITS` array in `composio-tool-router.ts`:

```typescript
const TOOLKITS = ['github', 'gmail', 'googlecalendar'];
```

Browse all available toolkits at [app.composio.dev/apps](https://app.composio.dev/apps).

## Authorising a toolkit

If a toolkit is not yet connected for the user, the Tool Router will return an
auth URL.  The agent will surface this URL so the user can complete the OAuth
flow before retrying.
