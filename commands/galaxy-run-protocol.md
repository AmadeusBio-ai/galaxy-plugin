---
name: galaxy-run-protocol
description: Execute a multi-step Galaxy protocol end-to-end (a paper methods section, vendor handbook, pasted SOP, or written analysis plan) with checkpoints between phases. 
argument-hint: "[path to protocol markdown, OR pasted text]"
disable-model-invocation: true
context: fork
agent: galaxy-operator
---

Rules:
- Extract genome-related sentences from the **protocol source only** (the file at `$ARGUMENTS` or the pasted protocol text). Quote them verbatim inside `<protocol-genome>...</protocol-genome>` tags in your plan.
- If the protocol uses a partial Galaxy UI label (e.g., `Human (Homo sapiens) (b38):` with no value after the colon), that is a **prefix to look up**, not a value to invent. Resolve it via Galaxy in Phase 0 (see below), not from memory.
- For every aligner / reference-index step, you MUST resolve the dbkey by enumerating Galaxy's options (see `efficient-discovery.md`) and emit an ASSEMBLY ASSERTION block before invoking the tool (see `galaxy-tool-execution` SKILL step 4).
- The Phase 0 resolution must be **persisted to the per-history assembly registry** at `outputs/.galaxy-context/<history_id>.json` via `bin/galaxy-assembly-registry.js set-assembly`. Every subsequent phase reads the **registry**, not the protocol text, as its source for `dbkey=` and `reference_genome|index` values. Full procedure: `skills/galaxy-tool-execution/references/assembly-resolution.md`.

1. Acquire the protocol:
   - If `$ARGUMENTS` names a file, read it via the `Read` tool.
   - Otherwise, the protocol text is in `$ARGUMENTS`.
2. Parse the protocol into discrete phases. A phase is one logical unit of work (e.g., "create history", "upload reference + reads", "QC", "primary tool", "summarize"). Keep phases small enough that a single failure doesn't waste an hour.
3. Plan: enumerate the phases as a numbered list in your first message back to the parent. Include each phase's expected tools, any quality gates the protocol specifies (e.g., "abort if alignment < 70%", "skip samples with < 1M reads"), and the expected outputs.

3.5 **Phase 0 — Assembly Resolution (mandatory, blocking).** Before executing any phase, resolve every reference-genome decision in the protocol and **persist it to the per-history registry**. This phase is non-optional whenever the protocol mentions a genome, a build, a UI label fragment, or sets a `dbkey` on an upload.

   Follow `skills/galaxy-tool-execution/references/assembly-resolution.md` in full. The procedure in brief:
   - Quote each genome-related sentence verbatim inside `<protocol-genome>...</protocol-genome>` tags. Do NOT paraphrase. Do NOT append a worked dbkey example.
   - Initialize the registry once you have a `history_id`:
     ```bash
     node "$CLAUDE_PLUGIN_ROOT/bin/galaxy-assembly-registry.js" init \
         --history-id "$HID" --history-name "$HNAME"
     ```
   - For every consuming tool (aligner, counter with built-in GTF, …), call `get_tool_details(tool_id=TOOL, io_details=True)` and filter the options list with `jq` (see `efficient-discovery.md`). Never read the raw options list into context.
   - Build an `ASSEMBLY RESOLUTION` table with columns: protocol quote, tool, candidate UI labels, picked option (value), rule applied.
   - Apply the resolution rule: `"latest"` → most recent date if dates are visible in labels, else highest patch; specific patch/date → exact match; bare build with no modifier → option with no patch suffix; partial UI-label prefix → option whose label starts with that prefix.
   - **Write the resolution back** to the registry before any subsequent phase runs:
     ```bash
     node "$CLAUDE_PLUGIN_ROOT/bin/galaxy-assembly-registry.js" set-assembly \
         --history-id "$HID" --build-family GRCh38 \
         --upload-dbkey "$DBKEY" --ui-label "$LABEL" \
         --protocol-quote "$QUOTE" --rule-applied "$RULE" \
         --candidate "<label 1>" --candidate "<label 2>"
     # then for the tool you used to resolve:
     node "$CLAUDE_PLUGIN_ROOT/bin/galaxy-assembly-registry.js" add-tool-index \
         --history-id "$HID" --build-family GRCh38 \
         --tool-id "$TOOLID" --param "reference_genome|index" --option-value "$OPT"
     ```
   - **Stop and surface the table** before invoking any tool. If running with the user in the loop, wait for explicit confirmation. If running unattended, proceed only when every row is unambiguous **and** every row is written to the registry; otherwise stop and ask.

4. Execute phase by phase:
   - Before each phase, load the relevant skills via the `Skill` tool (`galaxy-tool-execution` for any `run_tool`, `galaxy-histories-and-data` for uploads/previews, `galaxy-collections` if a collection appears, `galaxy-workflows` if the phase invokes an IWC workflow).
   - **Before any upload that sets `dbkey=` and before any `run_tool` that uses a built-in reference index, read the registry.** The registry is the *only* source for those values once Phase 0 has run; if `galaxy-assembly-registry.js read` exits 3 for the build family, STOP and re-do Phase 0 rather than guessing. Write back via `add-tool-index` (after per-tool resolution) and `add-upload` (after each upload).
   - For tools you've never used, run the discovery triad — but skip `io_details=True` on aligners and other tools with built-in reference-index pickers (the option list dumps every cached genome and blows the context). Prefer `get_tool_run_examples` first; fetch full details only if examples don't show the shape you need. See `galaxy-tool-execution/references/efficient-discovery.md`. (Exception: per-tool option resolution under Gate B *does* require `io_details=True` for that one tool — slice the response with `jq` so only the matched options enter your context.)
   - Poll via `get_dataset_details` (MCP), **never** via Bash + curl — the MCP server owns Galaxy credentials, your shell does not see them.
   - Poll every 30s, hard timeout 60 min per tool. Use `include_preview=False` for state checks; only set `True` when you actually need the output's content.
   - After each phase, sanity-check the output's contents (not just job state). Load `galaxy-mcp-gotchas` on any anomaly.
   - At each quality gate the protocol specifies, evaluate and **stop with a clear reason** if the gate fails — do not silently proceed.
5. Close out: load `galaxy-results-reporting`, build a short summary (whatever metrics are relevant to the protocol — read counts, alignment rate, top-N rows, peak counts, variant counts, etc.), download user-facing artifacts to `outputs/`. **Do not publish the history** unless the protocol explicitly asks for it OR the user separately confirms — publishing makes the history accessible to anyone with the URL.
6. Return a concise summary: per-phase one-liner with key numbers, list of locally downloaded files, any anomalies. Surface a public share URL only if publishing was authorized.

Do NOT hardcode any parameters from the protocol into your own defaults. The protocol supplies thresholds, tool choices, parameters, reference build; you supply the execution discipline.
