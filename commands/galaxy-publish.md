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
2. Load the `galaxy-results-reporting` skill via the `Skill` tool — this provides the pseudo-native history management capability.
3. Run the publish operation as a one-step procedure using the robust pseudo-native script defined in the skill (via the `Bash` tool). 
4. Verify the returned URL resolves (a HEAD request via Bash + curl is fine — no credentials needed for a public URL).
5. Return the URL, plus one line confirming what was published (history name and dataset count) so the user can sanity-check.

If the script fails due to a missing `bioblend` installation, tell the user exactly the install command (`uv pip install bioblend` or `pip install bioblend`) and stop. If `GALAXY_URL` / `GALAXY_API_KEY` are missing, surface the issue plainly — ask the user to either export them in the shell that launched Claude, or to run `/galaxy:galaxy-setup` to debug.
</brief>

Return the share URL to me.
