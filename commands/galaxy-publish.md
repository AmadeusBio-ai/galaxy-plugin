---
description: Publish the current/most-recent Galaxy history and return the share URL.
argument-hint: "[history name or id]"
---

Spawn the `galaxy-operator` subagent with this brief:

<brief>
Publish a Galaxy history and return its share URL.

1. Resolve the target history:
   - If `$ARGUMENTS` is non-empty, resolve to a history id.
   - Otherwise pick the user's most recently updated history.
2. Load the `galaxy-results-reporting` skill via the `Skill` tool — it has the BioBlend publishing fallback (the MCP server doesn't expose `share_history` natively).
3. Run the publish via BioBlend (use the `Bash` tool with `python -c "..."`):
   - Set `published=True, importable=True` on the history.
   - Construct the public URL: `https://<host>/u/<username>/h/<slug>` where `<host>` is the host portion of `$GALAXY_URL`, `<username>` comes from `get_current_user()`, and `<slug>` comes from the history update response.
4. Verify the URL resolves (a HEAD request via Bash + curl is fine).
5. Return ONLY the URL, plus one line confirming what was published (history name and dataset count).

If `bioblend` isn't installed, tell the user exactly the install command (`uv pip install bioblend` or `pip install bioblend`) and stop.
</brief>

Return the share URL to me.
