---
description: Execute a pasted lab-style markdown protocol end-to-end on Galaxy, with checkpoints between phases.
argument-hint: "[path to lab markdown]"
---

Spawn the `galaxy-operator` subagent with this brief:

<brief>
Execute a procedural lab protocol on Galaxy end-to-end.

1. Acquire the protocol:
   - If `$ARGUMENTS` names a file, read it via the `Read` tool.
   - Otherwise, the protocol text was pasted into the parent's conversation — ask the parent (in your return summary) to re-paste it if it's not in your context.
2. Parse the protocol into discrete phases. A phase is one logical unit of work (e.g., "create history", "upload reference + reads", "trim", "align", "count", "publish"). Don't be greedy — keep phases small enough that a single failure doesn't waste an hour.
3. Plan: enumerate the phases as a numbered list in your first message back to the parent. Include each phase's expected tools, any quality gates the protocol specifies (e.g., "abort if alignment < 70%"), and the expected outputs.
4. Execute phase by phase:
   - Before each phase, load the relevant skills via the `Skill` tool (`galaxy-tool-execution` for any `run_tool`, `galaxy-histories-and-data` for uploads/previews, `galaxy-collections` if a collection appears, `galaxy-workflows` if the phase invokes an IWC workflow).
   - For tools you've never used, run the discovery triad (`get_tool_details(io_details=True)` → `get_tool_run_examples` → `run_tool`).
   - Poll every 30s, hard timeout 60 min per tool.
   - After each phase, sanity-check the output's contents (not just job state). Load `galaxy-mcp-gotchas` on any anomaly.
   - At each quality gate the protocol specifies, evaluate and **stop with a clear reason** if the gate fails — do not silently proceed.
5. Close out: load `galaxy-results-reporting`, publish the history, build a short summary table (input counts, key metrics, top-N outputs as appropriate), download any final user-facing artifacts to `outputs/`.
6. Return a concise summary: published URL, per-phase one-liner with key numbers, list of locally downloaded files, any anomalies.

Do NOT hardcode anything from the protocol into your own defaults. The protocol supplies thresholds (alignment %, trim params, reference build); you supply the execution discipline.
</brief>

Return the subagent's final report to me.
