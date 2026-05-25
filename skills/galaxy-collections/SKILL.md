---
name: galaxy-collections
description: Manipulate Galaxy dataset collections reproducibly using Galaxy's native collection-operation tools — build a paired collection from two fastq lists, filter a collection by an identifier list or by metadata, relabel collection elements via a mapping file, sort/flatten/nest/zip/unzip collections, split paired-and-unpaired, tag elements with group tags, and use the Apply Rules DSL when simple tools aren't enough. Use this whenever the user mentions a collection, list:paired, paired-end pairing, filtering or relabeling a collection, grouping samples by condition, or restructuring nested collections.
disable-model-invocation: true
---

# Galaxy Collections

Owns all collection-shaped work: building, filtering, restructuring, relabeling, tagging. The non-negotiable rule: **all collection operations use Galaxy's native tools, never ad-hoc API manipulation**. This is what keeps the operation reproducible and extractable to a workflow.

## When to use

- "Build a paired collection from these R1 and R2 fastq lists"
- "Filter out samples starting with control_"
- "Keep only SRR123, SRR456, SRR789"
- "Relabel collection elements using this tabular mapping"
- "Group samples by treatment condition"
- "Flatten this list:paired into a flat list"
- "Why is my filter producing an empty collection?" → load `galaxy-mcp-gotchas` first, then come back here.

**Not for**: per-dataset analysis (`galaxy-tool-execution` with `batch: True` map-over handles that), uploading data (`galaxy-histories-and-data`), workflow invocation (`galaxy-workflows`).

## Prerequisites

- MCP connected.
- A history with the source collection(s) and any auxiliary files (filter lists, relabel mappings, tag tables) already uploaded.

## Pitfalls — read these first

These four cause the vast majority of collection-tool silent failures. The full debugging reference is `galaxy:galaxy-mcp-gotchas`; the ones below are inline because every collection op hits them.

### 1. Data inputs require the `values` wrapper

```python
# WRONG — tool runs with no input, produces empty output
inputs = {"input": {"src": "hdca", "id": collection_id}}

# CORRECT — values wrapper around the dataset/collection ref
inputs = {"input": {"values": [{"src": "hdca", "id": collection_id}]}}
```

True for `__FILTER_FROM_FILE__`, `__TAG_FROM_FILE__`, `__RELABEL_FROM_FILE__`, and most other filter/tag/relabel ops.

### 2. Conditional parameters use pipe notation

```python
# WRONG — nested object ignored
inputs = {"how": {"how_filter": "remove_if_absent", "filter_source": {...}}}

# CORRECT
inputs = {
    "how|how_filter": "remove_if_absent",
    "how|filter_source": {"values": [{"src": "hda", "id": filter_file_id}]},
}
```

### 3. Repeats use indexed prefixes

```python
inputs = {
    "datasets_0|input": {"src": "hda", "id": d1},
    "datasets_1|input": {"src": "hda", "id": d2},
    "datasets_2|input": {"src": "hda", "id": d3},
}
```

### 4. Verify by contents, not by job state

A wrong input dict → tool runs with defaults → job `ok` with empty/wrong output. Always preview the resulting collection's first element before chaining further.

## Strategy decision tree

In order of preference (use the lowest-numbered strategy that solves the problem):

### Strategy A — A dedicated collection-op tool

Use when the transformation maps directly onto one of Galaxy's built-in collection ops. See `references/tool-catalog.md` for the full table; the most common picks:

| Goal | Tool ID |
|---|---|
| Filter by identifier list | `__FILTER_FROM_FILE__` |
| Remove empty / failed / null elements | `__FILTER_EMPTY_DATASETS__`, `__FILTER_FAILED_DATASETS__`, `__FILTER_NULL__` |
| Keep only successful | `__KEEP_SUCCESS_DATASETS__` |
| Extract a single element by name/index | `__EXTRACT_DATASET__` |
| Flatten nested → flat | `__FLATTEN__` |
| Add a nesting level | `__NEST__` |
| Pair forward + reverse | `__ZIP_COLLECTION__` |
| Unpair into two lists | `__UNZIP_COLLECTION__` |
| Split paired vs unpaired | `__SPLIT_PAIRED_AND_UNPAIRED__` |
| Merge collections | `__MERGE_COLLECTION__` |
| Match two collections elementwise | `__HARMONIZELISTS__` |
| Rename via mapping file | `__RELABEL_FROM_FILE__` |
| Sort (alpha / numeric / by file) | `__SORTLIST__` |
| Tag elements via mapping file | `__TAG_FROM_FILE__` |
| Build a list from individual datasets | `__BUILD_LIST__` |
| Cross-product (all-vs-all) | `__CROSS_PRODUCT_FLAT__`, `__CROSS_PRODUCT_NESTED__` |

### Strategy B — Apply Rules (`__APPLY_RULES__`)

Use when the transformation needs regex on identifiers, tag-based restructuring, or combined filter-and-restructure. Apply Rules is more powerful but has a learning curve. Full DSL reference: `references/apply-rules-dsl.md`.

Core concept: **Collection → table of element metadata → transform → collection**. You write a list of `rules` that build up a table, then a list of `mapping` operations that turn the final table back into a collection structure.

### Strategy C — Upload a metadata table, then use it

Use when the metadata you need (sample → condition, sample → batch) doesn't exist in the collection at all. Upload a tabular file pasted from a Python string, then feed it to `__TAG_FROM_FILE__` or `__RELABEL_FROM_FILE__`. **Tell the user**: the mapping file is now an input to the analysis and must be shared with the workflow for full reproducibility.

### Strategy D — Mirror collection with attached tags (last resort)

Only when C can't capture the metadata in a table. Create a new collection with the same datasets and the required tags, then **tell the user**: for full reproducibility, re-run the analysis with the new collection from the start so the metadata association is captured.

## Critical patterns (quick reference)

### Filter by identifier list
```python
run_tool(history_id=H, tool_id="__FILTER_FROM_FILE__", inputs={
    "input": {"values": [{"src": "hdca", "id": collection_id}]},
    "how|how_filter": "remove_if_absent",
    "how|filter_source": {"values": [{"src": "hda", "id": id_list_file_id}]},
})
```

### Relabel from mapping file
```python
run_tool(history_id=H, tool_id="__RELABEL_FROM_FILE__", inputs={
    "input": {"src": "hdca", "id": collection_id},
    "how|how_select": "tabular",
    "how|labels": {"src": "hda", "id": mapping_file_id},
    "how|strict": False,
})
```

### Sort
```python
run_tool(history_id=H, tool_id="__SORTLIST__", inputs={
    "input": {"src": "hdca", "id": collection_id},
    "sort_type|sort_type": "alpha",   # or "numeric" or "file"
})
```

### Apply Rules — filter out `control_` samples
```python
run_tool(history_id=H, tool_id="__APPLY_RULES__", inputs={
    "input": {"src": "hdca", "id": collection_id},
    "rules": {
        "rules": [
            {"type": "add_column_metadata", "value": "identifier0"},
            {"type": "add_filter_regex", "target_column": 0,
             "expression": "^control_", "invert": True},
        ],
        "mapping": [
            {"type": "list_identifiers", "columns": [0]},
        ],
    },
})
```

## Example — pair R1/R2 fastqs, then filter to a sample whitelist

```
# 1) Pair the two flat lists into a list:paired collection
zipped = run_tool(history_id=H, tool_id="__ZIP_COLLECTION__", inputs={
    "input_forward": {"src": "hdca", "id": r1_list_id},
    "input_reverse": {"src": "hdca", "id": r2_list_id},
})
paired_id = zipped["output_collections"][0]["id"]

# 2) Upload the whitelist as a small tabular file (one identifier per line)
#    via upload_file with a temp file written from Python.

# 3) Filter
filtered = run_tool(history_id=H, tool_id="__FILTER_FROM_FILE__", inputs={
    "input": {"values": [{"src": "hdca", "id": paired_id}]},
    "how|how_filter": "remove_if_absent",
    "how|filter_source": {"values": [{"src": "hda", "id": whitelist_file_id}]},
})
final_id = filtered["output_collections"][0]["id"]

# 4) Verify by contents — preview the first element of the filtered collection
#    (silent failure check; if the collection is empty, the values wrapper
#    or filter source is probably wrong — load galaxy-mcp-gotchas).
```

## References

- `references/tool-catalog.md` — full table of every collection-op tool with purpose, when to use, and the exact input dict shape.
- `references/apply-rules-dsl.md` — complete Apply Rules grammar (column-add rules, filter rules, structural rules, mapping ops) with worked examples for paired-end filename parsing, group-tag restructuring, and filter-then-sort.
