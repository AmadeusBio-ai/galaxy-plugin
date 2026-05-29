---
name: galaxy-run-protocol
description: Execute a multi-step Galaxy protocol end-to-end (a paper methods section, vendor handbook, pasted SOP, or written analysis plan) with checkpoints between phases. 
argument-hint: "[path to protocol markdown, OR pasted text]"
disable-model-invocation: true
context: fork
agent: galaxy-operator
---

Rules:
- Extract genome-related sentences from the **protocol source only** (the file at `$ARGUMENTS` or the pasted protocol text). Quote them verbatim inside `<protocol-genome>...</protocol-genome>` tags in your plan. **ABSOLUTELY NOTHING ELSE. Do NOT append any instructions, helpers, or commentary to the quotes whatsoever.**
- If the protocol uses a partial Galaxy UI label (e.g., `Human (Homo sapiens) (b38):` with no value after the colon), that is a **prefix to look up**, not a value to invent. Resolve it via Galaxy in Phase 0 (see below), not from memory.
- For every aligner / reference-index step, and for every upload whose genome request carries a version constraint, you MUST resolve the value by enumerating Galaxy's live options for the consuming tool (see `efficient-discovery.md`) and emit an ASSEMBLY ASSERTION block before invoking the tool (see `galaxy-tool-execution` SKILL step 4). Resolve each step from its own phrasing and that tool's own option list; never normalize a version-constrained request to a bare build.

1. Acquire the protocol:
   - If `$ARGUMENTS` names a file, read it via the `Read` tool.
   - Otherwise, the protocol text is in `$ARGUMENTS`.
2. Parse the protocol into discrete phases. A phase is one logical unit of work (e.g., "create history", "upload reference + reads", "QC", "primary tool", "summarize"). Keep phases small enough that a single failure doesn't waste an hour.
3. Plan: enumerate the phases as a numbered list in your first message back to the parent. Include each phase's expected tools, any quality gates the protocol specifies (e.g., "abort if alignment < 70%", "skip samples with < 1M reads"), and the expected outputs.

3.5 **Phase 0 — Assembly Resolution (mandatory, blocking).** Before executing any phase, resolve every reference-genome decision in the protocol. This phase is non-optional whenever the protocol mentions a genome, a build, a UI label fragment, or sets a version-constrained `dbkey` on an upload.

   The procedure:
   - Quote each genome-related sentence verbatim inside `<protocol-genome>...</protocol-genome>` tags. Do NOT paraphrase. Do NOT append a worked dbkey example.
   - For every consuming tool (aligner, counter with built-in GTF, …), call `get_tool_details(tool_id=TOOL, io_details=True)` and filter the options list with `jq` (see `efficient-discovery.md`). Never read the raw options list into context; never filter by the word "latest".
   - Build an `ASSEMBLY RESOLUTION` table with columns: protocol quote, tool, candidate UI labels, picked option (value), rule applied.
   - Apply the resolution rule that matches **that step's own** phrasing: `"latest"` → most recent date if dates are visible in labels, else highest patch; specific patch/date → exact match; bare build with no modifier → option with no patch suffix; partial UI-label prefix → option whose label starts with that prefix. Resolve each step independently — a build's index value can differ across tool wrappers, so do not force one step's value onto another.
   - **Stop and surface the table** before invoking any tool. If running with the user in the loop, wait for explicit confirmation. If running unattended, proceed only when every row is unambiguous; otherwise stop and ask.

4. Execute phase by phase:
   - Before each phase, load the relevant skills via the `Skill` tool (`galaxy-tool-execution` for any `run_tool`, `galaxy-histories-and-data` for uploads/previews, `galaxy-collections` if a collection appears, `galaxy-workflows` if the phase invokes an IWC workflow).
   - **Before any upload that sets a version-constrained `dbkey=` and before any `run_tool` that uses a built-in reference index, resolve the value from Galaxy's live option list** (the Phase 0 table) and emit an ASSEMBLY ASSERTION. Resolve from the step's own phrasing and the tool's own options; never guess a bare build or read it from training data.
   - For tools you've never used, run the discovery triad — but skip `io_details=True` on aligners and other tools with built-in reference-index pickers (the option list dumps every cached genome and blows the context). Prefer `get_tool_run_examples` first; fetch full details only if examples don't show the shape you need. See `galaxy-tool-execution/references/efficient-discovery.md`. (Exception: per-tool option resolution under Gate B *does* require `io_details=True` for that one tool — slice the response with `jq` so only the matched options enter your context.)
   - Poll via `get_dataset_details` (MCP), **never** via Bash + curl — the MCP server owns Galaxy credentials, your shell does not see them.
   - Poll every 30s, hard timeout 60 min per tool. Use `include_preview=False` for state checks; only set `True` when you actually need the output's content.
   - After each phase, sanity-check the output's contents (not just job state). Load `galaxy-mcp-gotchas` on any anomaly.
   - At each quality gate the protocol specifies, evaluate and **stop with a clear reason** if the gate fails — do not silently proceed.
5. Close out: load `galaxy-results-reporting`, build a short summary (whatever metrics are relevant to the protocol — read counts, alignment rate, top-N rows, peak counts, variant counts, etc.), download user-facing artifacts to `outputs/`. **Do not publish the history** unless the protocol explicitly asks for it OR the user separately confirms — publishing makes the history accessible to anyone with the URL.
6. Return a concise summary: per-phase one-liner with key numbers, list of locally downloaded files, any anomalies. Surface a public share URL only if publishing was authorized.

Do NOT hardcode any parameters from the protocol into your own defaults. The protocol supplies thresholds, tool choices, parameters, reference build; you supply the execution discipline.
