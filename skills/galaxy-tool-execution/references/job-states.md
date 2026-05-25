# Galaxy Job States and Polling Discipline

Galaxy jobs run on shared infrastructure (especially on usegalaxy.org) and can sit in `queued` for anywhere from seconds to ~30 minutes depending on tool, instance load, and your historical fair-share weight. Polling is part of the job, not a bug.

## State machine

```
new → queued → running → ok
                       ↘ error
                       ↘ deleted
                       ↘ paused
```

| State | Meaning | Action |
|---|---|---|
| `new` | Galaxy accepted the request, hasn't queued yet | Keep polling |
| `queued` | Waiting for a slot on the cluster | Keep polling (this can be the longest phase) |
| `running` | Executing | Keep polling |
| `ok` | Finished successfully (does **not** guarantee the output is correct — verify contents) | Stop polling, sanity-check the output |
| `error` | Tool failed | Stop polling, read `stderr` from `get_job_details`, report to user |
| `deleted` | Someone deleted the job mid-flight | Stop polling, surface this — likely not what the user intended |
| `paused` | Upstream dependency failed in a workflow | Read the invocation's error and report |

## Polling cadence

- **Every 30 seconds** after kicking off `run_tool`. Don't poll faster — usegalaxy.org will rate-limit, and it doesn't give you anything (state transitions don't happen sub-30s for most tools).
- **Surface every state transition** to the parent with a timestamp. The wait should be visible, not silent — users panic when nothing happens for 10 minutes.
- **Hard timeout: 60 minutes per tool.** If a job hasn't reached a terminal state in an hour, report the `job_id` and stop. Do **not** retry blindly — re-submitting a job that's stuck because of an input problem just creates a second stuck job.

## Reading `stderr` after an error

```python
job = get_job_details(dataset_id=D)
# job["state"] == "error"
# job["stderr"] contains the tool's actual error output
# job["stdout"] sometimes has useful context
# job["command_line"] shows exactly what Galaxy invoked
```

`stderr` is usually a couple lines of the tool's complaint plus a Python/Java traceback. The first line of the tool's complaint is almost always the real problem — read that, not the traceback.

## Polling a collection map-over

A map-over `run_tool` returns `implicit_collections[]` and a list of `jobs[]` — one job per element. Poll each job; the collection is "done" when every element job is in a terminal state. If some succeed and some error, you have a partial collection — the user usually wants `__FILTER_FAILED_DATASETS__` applied before downstream processing (see `galaxy-collections`).

## Cancelling

The MCP server doesn't currently expose a cancel-job tool. To cancel: use the Galaxy UI, or call `cancel_workflow_invocation` if the job is part of a workflow invocation.

## State after a re-run

Galaxy de-duplicates job submissions: re-running an identical tool call against the same inputs returns the existing dataset rather than queuing a new job. This is usually fine, but if you've changed something the MCP can't see (e.g., manually edited a file in the UI), pass a small param tweak to force a new job.
