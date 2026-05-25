---
name: galaxy-mcp-gotchas
description: Debugging recipes for the galaxy-mcp server's silent-failure modes — load this when a Galaxy tool returns empty output, wrong format, no datasets, an unexpected count, "tool ran but no output", a job that finished ok but produced nothing useful, or a get_history_contents call that returns fewer items than expected. Covers the values-wrapper trap, pipe-notation for conditional params, dataset id vs hid confusion, hidden/deleted datasets, URL trailing slashes, pagination, and ordering.
disable-model-invocation: true
---

# Galaxy MCP Gotchas

The Galaxy MCP server's default failure mode is **silent**: a malformed input dict makes the tool run with defaults, produce an empty or wrong output, and report job state `ok`. Treating job status as evidence of success is the single biggest mistake. Always verify output **contents**.

This skill is the debug checklist. When something looks off, walk through the sections in order — most real-world failures are one of the first four.

## When to use

- "The job ran but the output is empty / wrong / smaller than expected"
- "`get_history_contents` returned nothing but the UI shows datasets"
- "I'm getting a wrong-format error / a values-wrapper error"
- "The conditional parameter I passed got ignored"
- "I have a hid number from the UI but the API doesn't accept it"
- Connection or auth errors on the first call after launching

**Not for**: routine tool execution (use `galaxy-tool-execution`), routine history navigation (use `galaxy-histories-and-data`).

## 1. Verify outputs by contents, not by job state

`get_job_details(dataset_id)` returning `state: ok` does **not** mean the tool did what you asked. A malformed input often runs the tool with defaults. After any non-trivial `run_tool`:

```
get_dataset_details(dataset_id, include_preview=True, preview_lines=15)
```

If the preview is empty, suspiciously small, or doesn't look like the expected output format → input dict was wrong. Reread `get_tool_details(tool_id, io_details=True)` and `get_tool_run_examples(tool_id)`.

## 2. Conditional parameters use pipe notation, not nesting

Galaxy tool XML uses `<conditional>` elements; the MCP serializes these with `parent|child` keys. Nesting the child in a sub-object is silently ignored.

```python
# WRONG — nested object is ignored, defaults are used
inputs = {
    "how": {
        "how_filter": "remove_if_absent",
        "filter_source": {"src": "hda", "id": file_id},
    },
}

# CORRECT — pipe notation
inputs = {
    "how|how_filter": "remove_if_absent",
    "how|filter_source": {"src": "hda", "id": file_id},
}
```

This is the most frequent silent-failure cause across all collection and filter tools.

## 3. Many tools require a `values` wrapper around dataset/collection refs

A bare `{"src": "hdca", "id": ...}` is accepted by some tools and silently ignored by others (notably `__FILTER_FROM_FILE__`, `__TAG_FROM_FILE__`, `__RELABEL_FROM_FILE__`, and most other collection ops). When in doubt, wrap:

```python
# Bare reference — fine for run_tool on most analysis tools
{"src": "hda", "id": dataset_id}

# Wrapped — required for filter/tag/relabel collection ops
{"values": [{"src": "hdca", "id": collection_id}]}
```

If a collection tool produced an empty output, add the wrapper and retry.

## 4. Dataset `id` vs `hid` — always use `id`

- `hid` is the small integer Galaxy shows in the UI (e.g., `42`). It is **not** an API identifier.
- `id` is the hex hash (`f9cad7b01a472135…`). Every MCP call wants this.

If you have only an `hid`, look it up via `get_history_contents(history_id=..., order="hid-dsc")` and find the matching element.

## 5. Empty `get_history_contents` — toggle `visible` and `deleted`

By default, the call returns only **visible, non-deleted** datasets. If the UI shows items but the API returns none, the items are hidden (common for intermediate workflow outputs) or marked deleted:

```python
get_history_contents(history_id="...", deleted=True, visible=False, limit=200)
```

## 6. Empty / wrong-format upload — set `file_type` and `dbkey`

`upload_file_from_url` auto-detects format poorly. Always pass `file_type` (e.g., `"gtf"`, `"fastqsanger.gz"`, `"bed"`) and, for any genomic file, pass `dbkey` (e.g., `"hg38"`, `"mm10"`). Downstream tools (Bowtie2, htseq-count) refuse inputs whose dbkey doesn't match the reference.

## 7. `GALAXY_URL` needs a trailing slash

```
Correct:  https://usegalaxy.org/
May fail: https://usegalaxy.org
```

This bites freshly-configured environments. If the first `connect` call hangs or 404s, check the trailing slash.

## 8. Large histories — paginate

Don't request all datasets at once. `limit=100, offset=N` and iterate.

## References

- `../galaxy-collections/references/apply-rules-dsl.md` — full Apply Rules DSL when you need it.
- `../galaxy-tool-execution/references/input-dict-patterns.md` — exhaustive input dict patterns (batch, linked, map_over_type, repeats).
