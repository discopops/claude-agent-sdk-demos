# Lookout

A personal, real-time intelligence **analyst** — not a news feed, not an OSINT dashboard.

The world is drowning in *signal*. The scarce thing an LLM can do that a dashboard cannot is
**interpretation**: given real-time signal, say *what it actually means, what the public is
thinking and feeling, and what people are most likely to do next* — personalized to you, and
surfaced only when it's earned.

Built on the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview).

> ⚠️ Demo/experimental. Local development only — not for production or at scale.

## The idea in one screen

For each thing it surfaces, Lookout emits an **Interpretation** — a small analytic brief, not a
data point:

- **what's happening** — a grounded, plain-language read of the raw signal
- **crowd mind-state** — the public's *motivation and emotional undercurrent* (fear, opportunism,
  outrage, euphoria, fatigue…), not a sentiment score
- **likely actions** — concrete mass behaviours people will take next, each with a probability and horizon
- **market calibration** — for any predicted outcome with a Kalshi market, the AI's own
  probability vs. the market-implied one. **Kalshi is the reality-check on the AI's predictions,
  not a third feed.** The *gap* is the insight: edge (the AI sees what the market hasn't priced)
  vs. over-read (the AI is wrong).
- **so what** — why *you* specifically should care
- **confidence + falsifiers**, and **grounding** citations for every claim

Example (real output, mock X + fixture Kalshi):

```
● digest  Federal Reserve  score 0.58  [V 1.00 C 1.00 K 0.98 R 0.70 N 1.00]  src:kalshi+x+trends
  mood: euphoria, opportunism, anxiety, fatigue — crowd believes a cut is now certain; underlying
        fear that "nobody is hedging the no-cut case" — crowded, unidirectional positioning
  likely: Refinancing surge ~82%, days · Panic selling if the Fed holds ~28%, hours after FOMC
  market: FED-JUL-CUT — AI 71% vs market 82% (-11pts) — Over-read / crowded trade. When nobody
          hedges the no-cut case, that is not confidence, it is crowding.
```

## How it works (the pipeline)

```
sense → resolve → score → interpret → deliver → remember
```

| Layer | What it does | v1 |
|------|--------------|----|
| **L1 Sensing** | Pluggable `SourceAdapter`s emit a canonical `NormalizedSignal` | Kalshi (live, free) · X (mock, MCP-ready) · Trends (best-effort/mock) |
| **L2 Resolve** | Cluster signals sharing an entity into a `Situation` (union-find) | lightweight alias keyer |
| **L3 Salience** | `S = Relevance^γ · base · Novelty`; base = velocity + convergence + conviction. Relevance is a multiplicative gate, so off-profile situations never interrupt. | keyword relevance |
| **Interpret** | The hero — forced-schema analyst pass via the Agent SDK | ✅ |
| **L5 Deliver** | silent / digest / earned interrupt | web dashboard + spoken interrupts + feedback; console + JSONL |
| **Memory** | Track situations over time; report *changes, not repeats* | SQLite |

The interpretation engine runs through the Claude Agent SDK's `query()`, forcing structured
output with an in-process MCP tool whose Zod schema *is* the Interpretation contract
(`src/interpret/`). The AI-vs-market gap is recomputed deterministically in code
(`src/interpret/calibrate.ts`) — the model supplies the judgement, not the arithmetic.

## Run it

```bash
bun install
bun run src/index.ts --once     # single tick, prints to console
bun run dev                     # continuous: starts the dashboard + ticks every LOOKOUT_TICK_SECONDS
```

`bun run dev` serves a live dashboard at **http://localhost:4317** — a digest feed of
interpretation cards, an earned-interrupt banner that is **spoken aloud** (browser TTS), and
per-card feedback buttons (relevant / flag / dismiss / mute) that nudge `feedbackBias` in your
profile and re-rank the board on the next tick.

No API key file is needed inside a Claude Code environment — the Agent SDK uses the ambient
Claude auth. Elsewhere, set `ANTHROPIC_API_KEY`. Copy `.env.example` → `.env` to configure.

**The lens is a file.** Edit `config/profile.json` (interests, regions, entities, standing
questions, thresholds) while Lookout is running — it hot-reloads and re-ranks on the next tick.

## Data-access notes

- **Kalshi** — free public read, no auth. Tries live; **falls back to `fixtures/kalshi/` when the
  endpoint is blocked** (e.g. an environment's egress policy) so the loop always runs, and returns
  to live automatically when reachable.
- **X** — MCP-ready but on `fixtures/x/` by default: new X accounts are pay-per-use with no free
  tier and the hosted-MCP OAuth flow can't complete non-interactively. Phase 3 wires
  `api.x.com/mcp` while keeping the same `NormalizedSignal` output.
- **Google Trends** — no official API; best-effort live with mock fallback. Attention tripwire, not truth.

## Roadmap

- **Phase 0 (done)** — sensing → resolve → salience → **interpretation + market calibration**, printed.
- **Phase 1 (done)** — live dashboard (digest feed + interpretation cards), earned-interrupt banner
  with **browser TTS**, and a feedback loop that tunes `feedbackBias` and re-ranks in place.
- **Phase 2** — deep multi-agent interpretation (lead → researcher + skeptic → synthesizer);
  interpretation **track record + self-correction** (own it when a prior read was wrong).
- **Phase 3** — live X via `api.x.com/mcp`; scheduled briefings; harden Trends.
- **Follow-on** — GDELT / ACLED / flight & ship telemetry / outage monitors as new adapters
  (drop-in: nothing downstream changes).

## Layout

```
config/     profile.json (the lens) · aliases.json · salience.json
fixtures/   x/ · trends/ · kalshi/  (mock + fallback data)
src/
  adapters/    types + registry + kalshi/x/trends
  resolve/     entities (keyer) + situations (clustering)
  salience/    score + router
  interpret/   schema · prompts/analyst.txt · engine · calibrate   ← the hero
  store/       db (SQLite) + signals/baselines/situations/interpretations
  scheduler/   the tick loop
  delivery/    console (JSONL + cards)
```
