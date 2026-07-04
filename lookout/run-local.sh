#!/usr/bin/env bash
# Lookout local launcher.
#
# The Agent SDK spawns the `claude` binary to run the interpretation engine.
# When you launch Lookout from *inside* an existing Claude Code session, the
# child inherits that session's OAuth/session env vars and tries to reuse the
# parent's auth channel instead of the ANTHROPIC_API_KEY in .env — which fails
# with `401 Invalid authentication credentials`.
#
# This wrapper scrubs those inherited session vars so the spawned agent
# authenticates cleanly via .env. From a plain terminal it's a harmless no-op.
#
# Usage:
#   ./run-local.sh            # continuous dev server + dashboard on :4317
#   ./run-local.sh --once     # single tick to stdout
set -euo pipefail
cd "$(dirname "$0")"

exec env \
  -u CLAUDECODE \
  -u CLAUDE_CODE_ENTRYPOINT \
  -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION \
  -u CLAUDE_CODE_OAUTH_SCOPES \
  -u CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH \
  -u CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH \
  -u CLAUDE_CODE_EXECPATH \
  -u CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES \
  -u CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL \
  -u CLAUDE_AGENT_SDK_VERSION \
  -u CLAUDE_EFFORT \
  bun run src/index.ts "$@"
