---
name: galaxy-status
description: List active Galaxy jobs in the most recent history with state and elapsed time.
argument-hint: "[history name or id]"
context: fork
agent: galaxy-operator
---

Report the status of active jobs.

1. Determine the target history:
   - If `$ARGUMENTS` is non-empty, resolve it (try by id first, then by name via `get_histories(name=...)`).
   - Otherwise use the user's most recently updated history (`list_history_ids()` then `get_history_details` on each candidate to find the most recently updated).
2. List the history's contents with `get_history_contents(history_id=H, order="update_time-dsc", limit=50)`.
3. For each item in a non-terminal state (`new`, `queued`, `running`, `paused`), call `get_job_details(dataset_id=...)` and collect: dataset name, state, tool id, elapsed time since job creation.
4. Sort the result by elapsed time descending (oldest first — those are the ones worth investigating).
5. Return a short table. If everything is terminal (all `ok` or `error`), say so plainly and surface any `error` jobs separately.
