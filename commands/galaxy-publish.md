---
description: Publish the current/most-recent Galaxy history and return the share URL.
argument-hint: "[history name or id]"
---

The user invoking `/galaxy-publish` is the explicit authorization to make the target history publicly accessible. Spawn the `galaxy-operator` subagent with this brief:

<brief>
Publish a Galaxy history and return its share URL. The user has authorized this by invoking `/galaxy-publish`.

1. Resolve the target history:
   - If `$ARGUMENTS` is non-empty, resolve to a history id.
   - Otherwise pick the user's most recently updated history, AND name it in your return summary so the user can confirm it was the intended one.
2. Load the `galaxy-results-reporting` skill via the `Skill` tool — it has the BioBlend publishing fallback (the MCP server doesn't expose `share_history` natively).
3. Run the publish via BioBlend (use the `Bash` tool with `python -c "..."`):
   - Set `published=True, importable=True` on the history.
   - Construct the public URL: `<host>/u/<username>/h/<slug>` where `<host>` is `$GALAXY_URL` without trailing slash (read via Python `os.environ`; do NOT print or log the API key), `<username>` comes from `get_current_user()`, and `<slug>` comes from the history update response.
4. Verify the URL resolves (a HEAD request via Bash + curl is fine — no credentials needed for a public URL).
5. Return the URL, plus one line confirming what was published (history name and dataset count) so the user can sanity-check.

If `bioblend` isn't installed, tell the user exactly the install command (`uv pip install bioblend` or `pip install bioblend`) and stop. If `GALAXY_URL` / `GALAXY_API_KEY` are not in the Python `os.environ` (the agent's Bash shell may not see them even when the MCP does), surface the issue plainly — ask the user to either export them in the shell that launched Claude, or to run `/galaxy:galaxy-setup` to debug.
</brief>

Return the share URL to me.
