# Lookout — PRODUCT.md

## Register

product — a personal dashboard. Design serves the reading, not the brand.

## What it is

A personal radar for what ordinary people around the world are thinking about,
worried about, and doing in their everyday lives — interpreted by an AI analyst,
not aggregated into a feed. One glance answers: what's everyone on about right
now, how do they feel, what will they do next, and is there money in it?

## Users

One user: Ben. Checks it on a laptop a few times a day (Brisbane, AEST),
between other work. Not a trader, not an analyst — wants the vibe of the world
at a glance, in plain words, with receipts available on demand.

## Primary task per screen

Scan the board in under 30 seconds: what's moved, what's the mood, any money
angle worth a look. Digging deeper (evidence, falsifiers, market calibration)
is a deliberate second click, never the default reading burden.

## Direct user quotes that define the product

- "Not more signal — the emphasis should be the interpretation."
- "Not an academic analysis — what people are thinking about and focusing on in their general lives."
- "I don't just want an Australian focus, I want it global."
- "Way too text heavy — I want it more visual."
- "Kalshi should be secondary to the other two."
- "More supporting sentiment, and identify opportunities to make money."

## Brand personality

Warm, plain-spoken, alive. A sharp mate telling you what everyone's on about —
not a terminal, not a briefing room. Visual first: mood, movement, and
magnitude carried by color, bars, and chips; prose is the caption, not the body.

## Anti-references (never look like)

- OSINT / intelligence dashboards (World Monitor, 435-feed walls)
- Bloomberg-terminal density; finance-first framing
- Academic memo prose; jargon ("narrative dynamics", "structural headwinds")
- Generic SaaS analytics (hero metrics, identical card grids)

## Accessibility

Dark theme, WCAG AA contrast for all reading text, reduced-motion respected,
keyboard-reachable controls. TTS interrupts already exist and stay.

## Constraints

Single-file vanilla HTML/CSS/JS client (`client/index.html`) served by Bun —
no build step, no frameworks. Data arrives over WebSocket as card events.
