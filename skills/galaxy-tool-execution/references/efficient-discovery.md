# Efficient Discovery

<instructions>
CRITICAL CONTEXT RULE: Do NOT read more than 50KB of tool metadata into context. Use targeted `jq` queries on auto-saved result files to extract necessary information.

1. `get_tool_details` for tools with reference indices (Bowtie2, BWA, etc.)
- Use `get_tool_run_examples(tool_id=TOOL)` first to write inputs dict.
- For Signature-Only check: `jq '.data.inputs | map({name, type, optional})' <path>`
- NEVER read `options` array for common reference-index pickers.

**Exception:** If the user specifies a specific assembly version, "latest", a patch, or any natural language constraint beyond the generic species name (e.g., "latest fruit fly", "Patch6", "GRCz11"), you must **not** blindly guess the base `dbkey`.

Instead, use a targeted `jq` query to retrieve all available options for the *base* genome (e.g., searching for `dm6` or `GRCm38`). You must then read the returned option strings and manually select the one that satisfies the user's chronological constraint (e.g., highest patch number, most recent date) or specific version.

**CRITICAL**: Do NOT search the options array for the word "latest" itself. Galaxy option strings contain dates and patch numbers (e.g., `GRCm38.p6 (mm10Patch6)`), not the word "latest".

```bash
# Extract all options matching the base genome (e.g., 'dm6' or 'GRCm38') to manually find the latest patch or specific version
jq '.data.inputs | .. | objects | select(.name=="index") | .options[]? | select(.[0] | test("(?i)<base_genome_keyword>"))' <path>
```

If the user does *not* specify a constraint and just says "fruit fly" or "dm6", you should "guess" the value based on standard dataset namespaces (e.g., `dm6`, `mm10`, `ce11`). You don't need to enumerate the options to know the base dbkey. Set it directly:

```python
inputs = {
    "reference_genome|source": "indexed",
    "reference_genome|index":  "dm6",
}
```

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