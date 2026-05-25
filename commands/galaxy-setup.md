---
description: Verify Galaxy MCP env, connect, and smoke-test the server.
---

Spawn the `galaxy-operator` subagent with this brief:

<brief>
Onboarding smoke test. Do all of the following in order and report a one-line pass/fail for each:

1. Confirm `$GALAXY_URL` and `$GALAXY_API_KEY` are set in the environment. If either is missing, stop and tell the user exactly which one and how to set it.
2. Call `connect(url=$GALAXY_URL, api_key=$GALAXY_API_KEY)`.
3. Call `get_user()` — report the username and email.
4. Call `get_server_info()` — report the Galaxy server version.
5. Call `list_history_ids()` — report the count and the 3 most recent history names.
6. Call `search_tools_by_name(query="trimmomatic")` — confirm at least one result comes back.

If any step fails, give the user the exact error and the most likely fix (URL trailing slash, expired API key, missing env var, `uvx` not installed).
</brief>

Return the subagent's report to me verbatim.
