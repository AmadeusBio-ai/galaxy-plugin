# Galaxy Job States and Polling Discipline

<instructions>
State Machine:
new → queued → running → ok | error | deleted | paused

- new / queued / running: Keep polling.
- ok: Stop polling, sanity-check the output.
- error: Stop polling, read `stderr` from `get_job_details`, report to user.
- deleted: Stop polling, surface this to user.
- paused: Read the invocation's error and report.

Polling Cadence:
- Use `ScheduleWakeup(delaySeconds=<calculated_time>)` based on expected runtime. Do NOT poll continuously.
- Resume polling loop only after the wakeup triggers.
- Surface every state transition to the user with a timestamp.
- Hard timeout: 60 minutes per tool. Report `job_id` and stop. Do NOT retry blindly.

Error Handling:
- Call `get_job_details(dataset_id=D)`.
- Read `stderr` (first line of tool's complaint). Ignore Python/Java tracebacks.

Collection Map-Over Polling:
- Poll each job in `jobs[]`. Collection is done when all element jobs are in terminal states.
- If partial success, apply `__FILTER_FAILED_DATASETS__` before downstream processing.

Cancelling:
- Use Galaxy UI or `cancel_workflow_invocation` for workflow jobs. (No MCP cancel-job tool).

Re-runs:
- Re-running identical tool calls returns existing dataset. Pass a small parameter tweak to force a new job if needed.
</instructions>