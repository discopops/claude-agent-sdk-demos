# Lookout — runs the continuous loop + dashboard.
FROM oven/bun:1.3

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Dashboard + WebSocket + endpoints.
EXPOSE 4317

# Auth: inside a Claude Code environment the SDK uses ambient auth; elsewhere set
# ANTHROPIC_API_KEY. Data sources default to mock/fixture and go live via env
# (KALSHI_BASE_URL, X_MCP_URL + X_MCP_BEARER, GDELT_BASE_URL). See RUNBOOK.md.
ENV LOOKOUT_PORT=4317
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD bun -e "await fetch('http://localhost:'+(process.env.LOOKOUT_PORT||4317)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
