# Efficient Discovery

<instructions>
CRITICAL CONTEXT RULE: Do NOT read more than 50KB of tool metadata into context. Use targeted `jq` queries on auto-saved result files to extract necessary information.

1. `get_tool_details` for tools with reference indices (Bowtie2, BWA, etc.)
- Use `get_tool_run_examples(tool_id=TOOL)` first to write inputs dict.
- For Signature-Only check: `jq '.data.inputs | map({name, type, optional})' <path>`
- NEVER read the full `options` array for reference-index pickers — it dumps every cached genome on the server (often >1MB) and blows your context. Use the **filtered** `jq` query below instead.

**CRITICAL**: Do NOT search the options array for the word "latest" itself. Galaxy option strings contain dates (e.g., `Jun, 2023`) and patch numbers (e.g., `GRCm38.p6 (mm10Patch6)`), not the word "latest". Filter by the **base species/build keyword**, then read ALL matches.

- To inspect deep conditional structures: `jq '.data.inputs | map(select(.name=="<param>")) | ...' <path>`.

2. `search_tools_by_name`
- Pick the first hit.
- If ambiguous, use `search_tools_by_keywords(keywords=["<tool>", "<topic>"])`.
- Do NOT read past the first 2-3 hits. Reuse `tool_id` in the same conversation.

3. Polling (MCP only, state only)
- Do NOT poll via `curl` from Bash. Use `get_dataset_details(dataset_id=D, include_preview=False)` or `get_job_details(dataset_id=D)`.
- Use `include_preview=False` in wait loops. Once state is "ok", fetch ONE preview with bounded `preview_lines=15`.
- Long jobs: Use `ScheduleWakeup`. < 5 min: delay=270s; 5-30 min: delay=1200s; > 30 min: delay=1800s.

4. Caching
- Do NOT re-fetch schema, dataset id/extension, or upload URL mappings within the same turn.
</instructions>