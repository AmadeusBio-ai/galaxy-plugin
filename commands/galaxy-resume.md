---
description: Triage a failed/stalled Galaxy pipeline — summarize completed steps, pull stderr for errors, propose next action.
argument-hint: "[history name or id]"
---

Spawn the `galaxy-operator` subagent with this brief:

<brief>
Triage a stalled or failed pipeline in a Galaxy history.

1. Resolve the target history (as in `/galaxy-status`).
2. List `get_history_contents(history_id=H, order="hid-asc", limit=200)` — full chronological order.
3. Partition the items by state: completed (`ok`), failed (`error`, `paused`), in-flight (`new`, `queued`, `running`).
4. For each failed item, call `get_job_details(dataset_id=...)` and extract:
   - tool id and version
   - the FIRST meaningful line of `stderr` (skip framework noise / tracebacks)
   - the `command_line` Galaxy invoked
5. Load `galaxy-mcp-gotchas` and check whether each failure matches a known silent-failure pattern (wrong pipe-notation, missing values wrapper, dbkey mismatch, hidden inputs).
6. Return a triage report:
   - **Completed**: N steps, named in order.
   - **Failed**: each with tool, first-line stderr, and a proposed fix.
   - **In-flight**: each with elapsed time; flag any past 30 min as worth investigating.
   - **Recommended next action**: one sentence — either "fix X and re-run step Y" or "cancel and restart from step Z".

Do NOT auto-retry anything. The user decides whether to re-run.
</brief>

Return the triage report to me.
