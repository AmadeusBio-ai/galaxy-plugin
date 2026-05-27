---
name: galaxy-mcp-gotchas
description: Debugging recipes for the galaxy-mcp server's silent-failure modes — load this when a Galaxy tool returns empty output, wrong format, no datasets, an unexpected count, "tool ran but no output", a job that finished ok but produced nothing useful, or a get_history_contents call that returns fewer items than expected. Covers the values-wrapper trap, pipe-notation for conditional params, dataset id vs hid confusion, hidden/deleted datasets, URL trailing slashes, pagination, and ordering.
disable-model-invocation: true
---

# Galaxy MCP Gotchas

<when_to_use>
- "The job ran but the output is empty / wrong / smaller than expected"
- "`get_history_contents` returned nothing but the UI shows datasets"
- "I'm getting a wrong-format error / a values-wrapper error"
- "The conditional parameter I passed got ignored"
- "I have a hid number from the UI but the API doesn't accept it"
- Connection or auth errors on the first call after launching

Not for:
- Routine tool execution (use `galaxy-tool-execution`)
- Routine history navigation (use `galaxy-histories-and-data`)
</when_to_use>

<instructions>
The Galaxy MCP server's default failure mode is SILENT: malformed input dicts run with defaults, produce empty outputs, but report `state: ok`. Walk through these checks when debugging:

1. Verify outputs by contents, not by job state
Always preview contents: `get_dataset_details(dataset_id, include_preview=True, preview_lines=15)`. If empty/wrong format, the input dict was wrong. Reread schema and examples.

2. Conditional parameters use pipe notation
Do NOT nest `<conditional>` elements. Use `parent|child` keys:
`{"how|how_filter": "remove_if_absent"}` (Correct)
`{"how": {"how_filter": "remove_if_absent"}}` (Silent failure)

3. Data inputs often require a `values` wrapper
Many collection ops (`__FILTER_FROM_FILE__`, `__TAG_FROM_FILE__`) ignore bare references. Wrap them:
`{"values": [{"src": "hdca", "id": collection_id}]}`

4. Dataset `id` vs `hid`
Use `id` (hex hash) for API calls. If the user provides `hid` (small integer, e.g., `42`), look it up via `get_history_contents` with `order="hid-dsc"` first.

5. Empty `get_history_contents`
The default hides hidden/deleted items. Toggle them to see intermediate workflow outputs:
`get_history_contents(history_id=H, deleted=True, visible=False, limit=200)`

6. Empty / wrong-format upload
`upload_file_from_url` requires `file_type` and `dbkey` (e.g., `"mm10"`) for genomic files. Otherwise, downstream tools refuse the input.

7. Connection hanging/404
Check if `GALAXY_URL` has a trailing slash (`https://usegalaxy.org/`).

8. Token-waste traps (Efficiency)
- Do NOT use `io_details=True` on aligners. It dumps huge lists of genomes. Rely on `get_tool_run_examples` or targeted `jq` queries.
- Do NOT enumerate all versions from `search_tools_by_name`. Take the top hit.
- Do NOT use `include_preview=True` in a polling loop. It dumps huge headers on every poll.
- Do NOT poll via `curl` from Bash. It lacks credentials. Use MCP and `ScheduleWakeup`.
- Do NOT re-fetch schemas/IDs already retrieved this turn.
</instructions>

## References
- `../galaxy-tool-execution/references/efficient-discovery.md` — full recipes for token-waste traps.
- `../galaxy-collections/references/apply-rules-dsl.md`
- `../galaxy-tool-execution/references/input-dict-patterns.md`
