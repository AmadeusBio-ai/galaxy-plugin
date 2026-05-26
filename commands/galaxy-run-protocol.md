---
description: Execute a multi-step Galaxy protocol end-to-end (a paper methods section, vendor handbook, pasted SOP, or written analysis plan) with checkpoints between phases.
argument-hint: "[path to protocol markdown, OR pasted text]"
---

Spawn the `galaxy-operator` subagent with this brief:

<brief>
Execute a procedural Galaxy protocol end-to-end.

1. Acquire the protocol:
   - If `$ARGUMENTS` names a file, read it via the `Read` tool.
   - Otherwise, the protocol text was pasted into the parent's conversation — if it's not in your context, ask the parent (in your return summary) to re-paste it.
2. Parse the protocol into discrete phases. A phase is one logical unit of work (e.g., "create history", "upload reference + reads", "QC", "primary tool", "summarize"). Keep phases small enough that a single failure doesn't waste an hour.
3. Plan: enumerate the phases as a numbered list in your first message back to the parent. Include each phase's expected tools, any quality gates the protocol specifies (e.g., "abort if alignment < 70%", "skip samples with < 1M reads"), and the expected outputs.
4. Execute phase by phase:
   - Before each phase, load the relevant skills via the `Skill` tool (`galaxy-tool-execution` for any `run_tool`, `galaxy-histories-and-data` for uploads/previews, `galaxy-collections` if a collection appears, `galaxy-workflows` if the phase invokes an IWC workflow).
   - For tools you've never used, run the discovery triad — but skip `io_details=True` on aligners and other tools with built-in reference-index pickers (the option list dumps every cached genome and blows the context). Prefer `get_tool_run_examples` first; fetch full details only if examples don't show the shape you need. See `galaxy-tool-execution/references/efficient-discovery.md`.
   - Poll via `get_dataset_details` (MCP), **never** via Bash + curl — the MCP server owns Galaxy credentials, your shell does not see them.
   - Poll every 30s, hard timeout 60 min per tool. Use `include_preview=False` for state checks; only set `True` when you actually need the output's content.
   - After each phase, sanity-check the output's contents (not just job state). Load `galaxy-mcp-gotchas` on any anomaly.
   - At each quality gate the protocol specifies, evaluate and **stop with a clear reason** if the gate fails — do not silently proceed.
5. Close out: load `galaxy-results-reporting`, build a short summary (whatever metrics are relevant to the protocol — read counts, alignment rate, top-N rows, peak counts, variant counts, etc.), download user-facing artifacts to `outputs/`. **Do not publish the history** unless the protocol explicitly asks for it OR the user separately confirms — publishing makes the history accessible to anyone with the URL.
6. Return a concise summary: per-phase one-liner with key numbers, list of locally downloaded files, any anomalies. Surface a public share URL only if publishing was authorized.

Do NOT hardcode any parameters from the protocol into your own defaults. The protocol supplies thresholds, tool choices, parameters, reference build; you supply the execution discipline.
</brief>

Return the subagent's final report to me.
