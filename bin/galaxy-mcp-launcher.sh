#!/usr/bin/env bash
set -e

ENV_FILE="${CLAUDE_PLUGIN_DATA:-$HOME/.local/share/claude-code/galaxy}/galaxy.env"

if [[ -z "${GALAXY_URL:-}" || -z "${GALAXY_API_KEY:-}" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
fi

if [[ -z "${GALAXY_URL:-}" || -z "${GALAXY_API_KEY:-}" ]]; then
  echo "galaxy-mcp-launcher: GALAXY_URL and/or GALAXY_API_KEY are not set." >&2
  echo "  Fix: either export them in the shell that launches Claude Code," >&2
  echo "       or run '/galaxy:galaxy-setup' to be prompted; values will be" >&2
  echo "       persisted to: $ENV_FILE" >&2
  exit 1
fi

exec uvx galaxy-mcp
