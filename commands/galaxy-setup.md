---
description: Verify Galaxy MCP credentials, prompting for and persisting them to .env if the shell doesn't already have them.
---

Galaxy MCP setup flow. Do all of the following in order:

1. **Detect shell env.** Run this Bash command and report which of the two are present in the shell. Never print the key value itself, only its length.

   ```bash
   bash -c 'echo "GALAXY_URL=${GALAXY_URL:-<unset>}"; if [[ -n "$GALAXY_API_KEY" ]]; then echo "GALAXY_API_KEY=<set (${#GALAXY_API_KEY} chars)>"; else echo "GALAXY_API_KEY=<unset>"; fi'
   ```

2. **Check persisted .env.** Check whether `${CLAUDE_PLUGIN_DATA}/galaxy.env` exists. If it does and the shell vars are unset, that file is what the launcher (`bin/galaxy-mcp-launcher.sh`) will source; tell the user. If both shell vars are already set, skip steps 3–5 and jump straight to step 6.

3. **Prompt only for what's missing.** For each of `GALAXY_URL` and `GALAXY_API_KEY` that is **not** present in either the shell or the existing `.env`, ask the user for it:
   - **URL** — default `https://usegalaxy.org/` (trailing slash required). Accept the default if they confirm.
   - **API key** — ask the user to paste their key (from `User → Preferences → Manage API Key` on their Galaxy instance). Acknowledge that pasting into the chat means the value will appear in the conversation transcript on disk. If they prefer not to, they can instead `export GALAXY_API_KEY=...` in their shell and restart Claude Code, in which case you should skip the `.env` write entirely.

4. **Persist.** Write a `.env` file at `${CLAUDE_PLUGIN_DATA}/galaxy.env` with exactly these contents (no `export`, no quotes, one assignment per line):

   ```
   GALAXY_URL=<value>
   GALAXY_API_KEY=<value>
   ```

   Before writing: `mkdir -p "${CLAUDE_PLUGIN_DATA}"`. After writing: `chmod 600 "${CLAUDE_PLUGIN_DATA}/galaxy.env"` so the key is readable only by the user.

5. **Reconnect.** Tell the user to run `/mcp` and reconnect the `galaxy` server (or restart Claude Code). The launcher re-runs on each MCP server start and will source the new `.env`.

6. **Smoke test.** Spawn the `galaxy:galaxy-operator` subagent with this brief:

   <brief>
   Call `mcp__galaxy__get_user()`, `mcp__galaxy__get_server_info()`, and `mcp__galaxy__search_tools_by_name(query="trimmomatic")`. Report one-line pass/fail per call, with username/email for get_user and version for get_server_info. Do **not** look at `$GALAXY_URL` or `$GALAXY_API_KEY` in the shell — the MCP server has them and that is what you are testing.
   </brief>

   Return the subagent's report verbatim.

If step 6 fails with auth/401, the most likely cause is an expired or wrong API key — direct the user to re-run `/galaxy:galaxy-setup` and re-paste the key.
