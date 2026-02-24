#!/bin/bash
set -euo pipefail

# Only run in remote (cloud) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# ============================================================
# API KEYS — add new keys to settings.json under "env" and
# list them here to make them available across the session.
# ============================================================
API_KEY_VARS=(
  COMPOSIO_API_KEY
  # Add more keys here as needed, e.g.:
  # OPENAI_API_KEY
  # GITHUB_TOKEN
  # SLACK_API_TOKEN
)

echo "Exporting API keys to session environment..."
for VAR in "${API_KEY_VARS[@]}"; do
  if [ -n "${!VAR:-}" ]; then
    echo "export ${VAR}=\"${!VAR}\"" >> "$CLAUDE_ENV_FILE"
    echo "  ✓ ${VAR}"
  else
    echo "  ⚠ ${VAR} not set — add it to .claude/settings.json under \"env\""
  fi
done

echo "Session environment setup complete."
