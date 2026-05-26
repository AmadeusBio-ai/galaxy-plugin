#!/usr/bin/env bash
set -e

# Credential resolution order (first wins, never overwritten by a later source):
#   1. Shell-exported GALAXY_URL / GALAXY_API_KEY
#   2. ./.galaxy.env in the working directory (galaxy-specific override)
#   3. ./.env in the working directory (generic project file)
#
# Parsing is manual KEY=VALUE rather than `source`, so a hostile .env cannot
# execute arbitrary shell when the MCP server starts.

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Strip CR (Windows line endings) and leading/trailing whitespace.
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    # Skip blanks and comments.
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue

    # Require KEY=VALUE; skip anything else (no `export FOO`, no `KEY VALUE`).
    [[ "$line" != *"="* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"

    # Strip optional surrounding single or double quotes from value.
    if [[ "$val" == \"*\" && "$val" == *\" ]]; then
      val="${val:1:${#val}-2}"
    elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
      val="${val:1:${#val}-2}"
    fi

    # Only set if not already set (preserves shell-export precedence).
    if [[ -z "${!key:-}" ]]; then
      export "$key=$val"
    fi
  done < "$file"
}

if [[ -z "${GALAXY_URL:-}" || -z "${GALAXY_API_KEY:-}" ]]; then
  load_env_file ".galaxy.env"
fi
if [[ -z "${GALAXY_URL:-}" || -z "${GALAXY_API_KEY:-}" ]]; then
  load_env_file ".env"
fi

if [[ -z "${GALAXY_URL:-}" || -z "${GALAXY_API_KEY:-}" ]]; then
  echo "galaxy-mcp-launcher: GALAXY_URL and/or GALAXY_API_KEY are not set." >&2
  echo "  Looked in: shell env, $PWD/.galaxy.env, $PWD/.env" >&2
  echo "  Fix one of:" >&2
  echo "    1. Export both vars in the shell, then restart Claude Code:" >&2
  echo "         export GALAXY_URL=\"https://usegalaxy.org/\"" >&2
  echo "         export GALAXY_API_KEY=\"<your-key>\"" >&2
  echo "    2. Create $PWD/.env (or .galaxy.env) with:" >&2
  echo "         GALAXY_URL=https://usegalaxy.org/" >&2
  echo "         GALAXY_API_KEY=<your-key>" >&2
  echo "       then chmod 600 the file and run /mcp to reconnect 'galaxy'." >&2
  echo "  Do NOT paste your API key into Claude's chat; edit the file with your own editor." >&2
  exit 1
fi

exec uvx galaxy-mcp
