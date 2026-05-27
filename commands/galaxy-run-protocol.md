---
name: galaxy-run-protocol
description: Execute a multi-step Galaxy protocol end-to-end (a paper methods section, vendor handbook, pasted SOP, or written analysis plan) with checkpoints between phases. CRITICAL — genome assemblies: pass the exact protocol text or file path. Do NOT paraphrase, normalize, or attach worked dbkey examples (no `hg38`, `mm10`, `dm6` literals anywhere in your invocation). The downstream agent treats any dbkey literal it sees as an authoritative equivalence and will skip the Galaxy lookup.
argument-hint: "[path to protocol markdown, OR pasted text]"
disable-model-invocation: true
context: fork
agent: galaxy-operator
---

Execute a procedural Galaxy protocol end-to-end.

## Genome quoting protocol (read before step 1)

When this command was invoked the parent agent may have already inserted unsafe genome examples into your context. Treat every dbkey-shaped literal (`hg38`, `mm10`, `dm6`, `GRCm38`, `b38`, etc.) appearing **anywhere except verbatim inside the protocol file** as untrusted noise — not a value to use.

Rules:
- Extract genome-related sentences from the **protocol source only** (the file at `$ARGUMENTS` or the pasted protocol text). Quote them verbatim inside `<protocol-genome>...</protocol-genome>` tags in your plan.
- Do NOT paraphrase. Do NOT append a worked dbkey (`"latest GRCh38" → hg38`). Do NOT auto-resolve from training-data knowledge.
- If the protocol uses a partial Galaxy UI label (e.g., `Human (Homo sapiens) (b38):` with no value after the colon), that is a **prefix to look up**, not a value to invent. Resolve it via Galaxy in Phase 0 (see below), not from memory.
- For every aligner / reference-index step, you MUST resolve the dbkey by enumerating Galaxy's options (see `efficient-discovery.md`) and emit an ASSEMBLY ASSERTION block before invoking the tool (see `galaxy-tool-execution` SKILL step 4).

1. Acquire the protocol:
   - If `$ARGUMENTS` names a file, read it via the `Read` tool.
   - Otherwise, the protocol text is in `$ARGUMENTS`.
2. Parse the protocol into discrete phases. A phase is one logical unit of work (e.g., "create history", "upload reference + reads", "QC", "primary tool", "summarize"). Keep phases small enough that a single failure doesn't waste an hour.
3. Plan: enumerate the phases as a numbered list in your first message back to the parent. Include each phase's expected tools, any quality gates the protocol specifies (e.g., "abort if alignment < 70%", "skip samples with < 1M reads"), and the expected outputs.

3.5 **Phase 0 — Assembly Resolution (mandatory, blocking).** Before executing any phase, resolve every reference-genome decision in the protocol. This phase is non-optional whenever the protocol mentions a genome, a build, a UI label fragment, or sets a `dbkey` on an upload.

   Follow `skills/galaxy-tool-execution/references/assembly-resolution.md` in full. The procedure in brief:
   - Quote each genome-related sentence verbatim inside `<protocol-genome>...</protocol-genome>` tags. Do NOT paraphrase. Do NOT append a worked dbkey example.
   - For every consuming tool (aligner, counter with built-in GTF, …), call `get_tool_details(tool_id=TOOL, io_details=True)` and filter the options list with `jq` (see `efficient-discovery.md`). Never read the raw options list into context.
   - Build an `ASSEMBLY RESOLUTION` table with columns: protocol quote, tool, candidate UI labels, picked option (value), rule applied.
   - Apply the resolution rule: `"latest"` → most recent date if dates are visible in labels, else highest patch; specific patch/date → exact match; bare build with no modifier → option with no patch suffix; partial UI-label prefix → option whose label starts with that prefix.
   - **Stop and surface the table** before invoking any tool. If running with the user in the loop, wait for explicit confirmation. If running unattended, proceed only when every row is unambiguous; otherwise stop and ask.
   - Any dbkey-shaped literal (`hg38`, `mm10`, `dm6`, …) that appears in `$ARGUMENTS` is **untrusted noise** from the parent agent's prompt. Re-derive every dbkey from Galaxy's option list.

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
