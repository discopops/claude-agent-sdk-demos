# Lookout — Go-Live Runbook

Lookout runs end-to-end **for free on mock/fixture data** out of the box. Each source has a
live path that engages via env vars and **degrades to fixtures on any failure**, so flipping a
source live is safe and reversible. This runbook lists exactly what to set and how to confirm it.

## 0. Prerequisites
- [Bun](https://bun.sh) (or Docker).
- Claude access, either:
  - **Subscription (no API spend)**: log the Claude Code CLI in once (`claude` → `/login`,
    pick your Claude subscription) and leave `ANTHROPIC_API_KEY` unset — the SDK-spawned
    binary uses its own login. If interpretation fails with `401`, the CLI login is stale:
    re-run `/login`.
  - **Metered API**: set `ANTHROPIC_API_KEY` in `.env`.
- **Open outbound egress** to the data hosts you want live (many sandboxes block them).

```bash
bun install
bun run dev          # dashboard at http://localhost:4317
curl -s localhost:4317/health | jq   # per-source mode: live | mock
```
`/health` is the ground truth for what's actually live. Each source reports `mode` and any
`lastError` that caused a fallback.

## 1. Kalshi (free, no auth) — the market calibrator
Public read endpoints need no key. It's already "live" in code; it just needs egress.
```bash
# default; only override to point at a proxy/mirror
export KALSHI_BASE_URL=https://external-api.kalshi.com/trade-api/v2
```
Confirm: `/health` shows `kalshi: live`; cards show real implied probabilities and the header
track record accrues `points`. Settlements (for the Brier scorecard) ingest automatically from
Kalshi's settled markets once live; until then they come from `fixtures/kalshi-settled/`.

## 2. GDELT (free, no auth) — geographic ground truth, OPT-IN
GDELT is a follow-on source, off by default: the core bet is interpretation over
aggregation, so breadth is a choice, not a default. Enable it only once you've
confirmed its geography is sharpening interpretations rather than adding surface area.
```bash
export LOOKOUT_ENABLE_GDELT=1
export GDELT_BASE_URL=https://api.gdeltproject.org/api/v2/doc/doc   # default
```
Confirm: `/health` shows `gdelt: live`; situations gain a `gdelt` source and real `sourcecountry`
geography. Note: GDELT's DOC API routinely takes 8–10s to respond and rate-limits by IP
(HTTP 429) — the adapter falls back to fixtures and recovers automatically.

## 3a. Grok voices — live X chatter, the cheap door (opt-in)
Grok (xAI) has native live-X search, so it can report what people are actually
saying without the X API's $200/mo floor. Wired as deep-pass ENRICHMENT, not a
poll source: a gather only happens when a situation already earned a deep pass
(auto-escalation, standing question, or "dig in"), and a hard daily gather cap
bounds spend (default 20 gathers/day).
```bash
export LOOKOUT_ENABLE_GROK_VOICES=1
export XAI_API_KEY=xai-...                 # console.x.ai — check the data-sharing
                                           # program: up to $175/mo free credits
export LOOKOUT_GROK_GATHERS_PER_DAY=20     # cost seatbelt
```
Confirm: deep cards gain a "live X:" voices row and `src:` includes `grok-x`;
the server logs `[grok-voices] gathered N voices (… today)` with the running meter.

## 3b. X — hosted MCP (paid, interactive auth)
X has **no free tier for new accounts** (pay-per-use) and the hosted MCP (`api.x.com/mcp`, launched
30 Jun 2026) needs an **OAuth flow that cannot complete non-interactively**. Do this on a machine
where you can complete the auth, then inject the resulting bearer:
```bash
export X_MCP_URL=https://api.x.com/mcp
export X_MCP_BEARER=<token from the X developer console / OAuth flow>
```
The SDK connects to X's MCP as a client (`src/adapters/x-live.ts`), an agent gathers current
discussion for your profile's entities, and emits it as `NormalizedSignal`s. Any failure →
mock fixtures. Confirm: `/health` shows `x: live`. **Budget note:** reads are metered
(~$0.005/post), so keep `LOOKOUT_TICK_SECONDS` sane and the entity set focused.

## 4. Delivery
```bash
export LOOKOUT_BRIEF_TIMES=08:00,17:00               # spoken daily briefs
export LOOKOUT_NOTIFY_WEBHOOK=https://hooks.…/lookout  # fan interrupts+briefs to Slack/Discord/push/SMS
```

## 5. Depth knobs
```bash
export LOOKOUT_AUTO_DEEP=1        # auto multi-agent deep pass on high salience / standing questions
export LOOKOUT_MAX_AUTODEEP=1     # per-tick cap (cost control)
export LOOKOUT_LLM_RELEVANCE=1    # sharper relevance gate (1 cheap call per candidate/tick)
export LOOKOUT_MODEL=claude-haiku-4-5-20251001   # interpretation model
```
**Cost stacking:** these knobs compound. AUTO_DEEP (4 calls/escalation) + LLM_RELEVANCE
(1 call per candidate per tick) + a short `LOOKOUT_TICK_SECONDS` + metered live X multiply
each other — turn them on one at a time and watch a few ticks before adding the next.

## 6. Docker
```bash
docker build -t lookout .
docker run -p 4317:4317 --env-file .env lookout
# healthcheck hits /health automatically
```

## 7. Smoke test (any environment)
```bash
bun run src/index.ts --once      # one tick to stdout; confirm cards + market calibration
curl -s localhost:4317/health    # (with `bun run dev` running) confirm source modes
curl -s -X POST localhost:4317/brief -d '{}'   # compile + speak a brief now
```

## What can't be verified without going live
- Real X discussion (needs paid creds + interactive OAuth + egress).
- Real Kalshi/GDELT data (needs egress).
The **code paths** are exercised here against local mock servers (see the tests referenced in the
PR), so going live is a config change, not a code change.
