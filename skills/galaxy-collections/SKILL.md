---
name: galaxy-collections
description: Manipulate Galaxy dataset collections reproducibly using Galaxy's native collection-operation tools — build a paired collection from two fastq lists, filter a collection by an identifier list or by metadata, relabel collection elements via a mapping file, sort/flatten/nest/zip/unzip collections, split paired-and-unpaired, tag elements with group tags, and use the Apply Rules DSL when simple tools aren't enough. Use this whenever the user mentions a collection, list:paired, paired-end pairing, filtering or relabeling a collection, grouping samples by condition, or restructuring nested collections.
disable-model-invocation: true
---

# Galaxy Collections

<when_to_use>
- "Build a paired collection from these R1 and R2 fastq lists"
- "Filter out samples starting with control_"
- "Keep only SRR123, SRR456, SRR789"
- "Relabel collection elements using this tabular mapping"
- "Group samples by treatment condition"
- "Flatten this list:paired into a flat list"
- "Why is my filter producing an empty collection?" → load `galaxy-mcp-gotchas` first.

Not for:
- Per-dataset analysis (use `galaxy-tool-execution` with `batch: True`)
- Uploading data (use `galaxy-histories-and-data`)
- Workflow invocation (use `galaxy-workflows`)
</when_to_use>

<instructions>
All collection operations MUST use Galaxy's native tools, never ad-hoc API manipulation. Ensure MCP is connected and required files are uploaded.

Strategy Priority:
A) Use dedicated tools (e.g., `__FILTER_FROM_FILE__`, `__ZIP_COLLECTION__`).
B) Use Apply Rules (`__APPLY_RULES__`) for regex, tag-based restructuring, or combined operations.
C) Upload a metadata table, then use `__TAG_FROM_FILE__` or `__RELABEL_FROM_FILE__`. Tell the user this table is now part of the reproducible workflow.
D) Mirror collection with attached tags (last resort).

Pitfalls to avoid:
1. Data inputs require `values` wrapper: `{"input": {"values": [{"src": "hdca", "id": collection_id}]}}`.
2. Conditional parameters use pipe notation: `"how|how_filter": "remove_if_absent"`.
3. Repeats use indexed prefixes: `"datasets_0|input"`, `"datasets_1|input"`.
4. Verify by contents: A wrong input dict produces an empty/wrong output with `state: ok`. Always preview the first element.

Critical Patterns:

Filter by identifier list:
`run_tool(history_id=H, tool_id="__FILTER_FROM_FILE__", inputs={"input": {"values": [{"src": "hdca", "id": collection_id}]}, "how|how_filter": "remove_if_absent", "how|filter_source": {"values": [{"src": "hda", "id": id_list_file_id}]}})`

Relabel from mapping file:
`run_tool(history_id=H, tool_id="__RELABEL_FROM_FILE__", inputs={"input": {"src": "hdca", "id": collection_id}, "how|how_select": "tabular", "how|labels": {"src": "hda", "id": mapping_file_id}, "how|strict": False})`

Sort:
`run_tool(history_id=H, tool_id="__SORTLIST__", inputs={"input": {"src": "hdca", "id": collection_id}, "sort_type|sort_type": "alpha"})`

Apply Rules (filter out `control_` samples):
`run_tool(history_id=H, tool_id="__APPLY_RULES__", inputs={"input": {"src": "hdca", "id": collection_id}, "rules": {"rules": [{"type": "add_column_metadata", "value": "identifier0"}, {"type": "add_filter_regex", "target_column": 0, "expression": "^control_", "invert": True}], "mapping": [{"type": "list_identifiers", "columns": [0]}]}})`
</instructions>

<example>
# Pair R1/R2 fastqs, then filter to a sample whitelist
zipped = run_tool(history_id=H, tool_id="__ZIP_COLLECTION__", inputs={
    "input_forward": {"src": "hdca", "id": r1_list_id},
    "input_reverse": {"src": "hdca", "id": r2_list_id},
})
paired_id = zipped["output_collections"][0]["id"]

# (Upload whitelist via upload_file with temp file written from Python)

filtered = run_tool(history_id=H, tool_id="__FILTER_FROM_FILE__", inputs={
    "input": {"values": [{"src": "hdca", "id": paired_id}]},
    "how|how_filter": "remove_if_absent",
    "how|filter_source": {"values": [{"src": "hda", "id": whitelist_file_id}]},
})
final_id = filtered["output_collections"][0]["id"]

# Verify by contents (preview first element)
</example>

## References
- `references/tool-catalog.md` — full table of collection-op tools.
- `references/apply-rules-dsl.md` — Apply Rules grammar and examples.
