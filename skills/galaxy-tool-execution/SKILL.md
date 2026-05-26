---
name: galaxy-tool-execution
description: Run Galaxy tools end-to-end via the galaxy-mcp server — search the toolbox by name or keyword, inspect a tool's input schema with get_tool_details, look up working examples with get_tool_run_examples, construct a correct inputs dict (including src:hda dataset refs and pipe-notation for conditional parameters), invoke run_tool, and poll get_job_details until the job reaches ok or error. Use this whenever the user wants to run, invoke, queue, or execute a named Galaxy tool (Trimmomatic, Bowtie2, BWA, htseq-count, FastQC, samtools, etc.), find a tool that does X, or monitor a running/queued/errored Galaxy job.
disable-model-invocation: true
---

# Galaxy Tool Execution

The most-used skill in the plugin. Owns the discovery → invocation → monitoring loop for any Galaxy tool. The hardest part is constructing the `inputs` dict — Galaxy tool XML uses conditionals and repeats that don't map to flat Python dicts, and a wrong shape silently produces garbage output rather than an error.

## When to use

* "Run  with these params on my dataset"
* "Find a tool that does X" (adapter trimming, peak calling, variant calling, etc.)
* "Run the aligner against  and save the mapping stats"
* "My job 4f3e… has been queued for 20 minutes — what's going on?"
* "The tool finished ok but produced a 0-byte / empty output" → first load `galaxy-mcp-gotchas`, then come back here.

**Not for**:

* Uploading data or managing histories — use `galaxy-histories-and-data`.
* Multi-step canned pipelines — check `galaxy-workflows` for an IWC workflow first if there are more than ~3 chained tools.
* Collection-specific tools (`__FILTER_FROM_FILE__`, Apply Rules) — use `galaxy-collections`.

## Prerequisites

* MCP connected (run `/galaxy-setup` if not).
* A history to write into.
* All input datasets uploaded and in state `ok`.

## Workflow — the discovery → run → poll triad

This is the discipline. Skipping any step is the cause of most `run_tool` failures.

### 1. Discover the tool

```python
search_tools_by_name(query="<tool name>")
# or
search_tools_by_keywords(keywords=["<topic1>", "<topic2>"])

```

Pick the **full ToolShed ID** (e.g., `toolshed.g2.bx.psu.edu/repos/<owner>/<name>/<name>/<version>`), not the short name. Short names work but aren't reproducible.

**Token tip:** `search_tools_by_name` returns every cached version of the tool plus near-name matches. Take the top hit (Galaxy returns the most-recent revision first) and move on — don't enumerate. If the search is noisy (e.g., a name that appears in several tool families), use `search_tools_by_keywords` with two specific terms instead.

### 2. Inspect the schema (Tiered Retrieval)

Always prioritize **Signature** retrieval before pulling the full input/output map.

```python
get_tool_details(tool_id=TOOL, io_details=False)

```

If you need the full parameter tree to understand conditional structures or repeats, you must limit the context footprint. Either follow up with targeted `jq` queries (e.g., `jq '[.data.inputs[].name]'`, `jq '.data.inputs | map(select(.name=="library"))'`) or only call with `io_details=True` if the signature and examples aren't enough.

**Token trap (Aligners & Reference-Index Pickers):** Tools with built-in reference-index pickers (Bowtie2, BWA, HISAT2, STAR, Salmon, htseq-count's `reference_source=cached`, etc.) return option lists containing every cached genome on the server — easily 500KB+ of response. **Do not fetch the list of available genomes.** Instead, you must supply the target genome build directly from your execution plan. Two safer paths:

* Call `get_tool_run_examples(tool_id)` first; examples usually show the input-dict shape you need without dumping option lists.
* If you still need `get_tool_details(io_details=True)`, rely on the auto-saved file response and use `jq` to extract only the essential inputs instead of re-reading the whole file. See `references/efficient-discovery.md`.

### 3. Look up real examples

```python
get_tool_run_examples(tool_id=TOOL)

```

Returns the tool's XML test cases as actual input dicts. **Use these as your template.** They cover the exact pipe-notation and wrapper conventions for this specific tool — guessing is how you end up debugging silent failures.

### 4. Run

```python
run_tool(history_id=H, tool_id=TOOL, inputs=INPUTS)

```

Response includes `outputs[]` (new datasets), `output_collections[]`, `implicit_collections[]`, and `jobs[]`. Save the relevant dataset IDs immediately.

### 5. Poll to terminal state

```python
# State-only poll — small response; use this to check status:
get_dataset_details(dataset_id=D, include_preview=False)
# Or, equivalently, on the job:
get_job_details(dataset_id=D)
# states: new → queued → running → ok | error

```

**Polling Efficiency (Phase 2):** `ScheduleWakeup` is the **mandatory first choice** for any job expected to take more than 2 minutes (e.g., alignments, assemblies, large data operations). Do not busy-loop. For very fast tools only, you may poll every 30 seconds. Surface state transitions to the parent with timestamps. Hard timeout: 60 minutes per tool. On `error`, read `stderr` from the job details and report it — do not retry blindly.

**Never poll Galaxy via `curl` from Bash.** The MCP server owns Galaxy credentials; the agent's shell does not see `GALAXY_URL` / `GALAXY_API_KEY` and won't get them by sourcing `.env` (and shouldn't try — `.env` is the user's credential storage). The only correct poll is the MCP call above.

See `references/job-states.md` for the full state machine and `references/efficient-discovery.md` for polling cost tactics.

### 6. Verify outputs by contents

After `state: ok`, confirm the output makes sense:

```python
get_dataset_details(dataset_id=D, include_preview=True, preview_lines=15)

```

If the preview is empty, zero-length, or wrong format, treat it as a silent failure — load `galaxy-mcp-gotchas`.

## Critical patterns

### `src: "hda"` for datasets, `src: "hdca"` for collections

```python
inputs = {
    "input_fastq": {"src": "hda", "id": fastq_dataset_id},        # single dataset
    "input_collection": {"src": "hdca", "id": collection_id},     # collection
}

```

`hda` = HistoryDatasetAssociation, `hdca` = HistoryDatasetCollectionAssociation. The MCP will not infer this for you.

### Pipe notation for conditional parameters

Galaxy tool XML's `<conditional>` blocks serialize as `parent|child` keys, **not** nested objects.

```python
# WRONG — nested object silently ignored
inputs = {
    "operations": {
        "operation": {
            "name": "SLIDINGWINDOW",
            "window_size": 4,
            "required_quality": 20,
        }
    }
}

# CORRECT — pipe notation for every level
inputs = {
    "operations_0|operation|name": "SLIDINGWINDOW",
    "operations_0|operation|window_size": 4,
    "operations_0|operation|required_quality": 20,
}

```

When `get_tool_run_examples` shows a key like `"foo|bar|baz": value` — copy that exact key shape. Do not try to nest it.

### Repeats use indexed prefixes

For `<repeat>` blocks (e.g., multiple trimming operations, multiple input files in a tool that accepts a list):

```python
inputs = {
    "operations_0|operation|name": "SLIDINGWINDOW",
    "operations_0|operation|window_size": 4,
    "operations_0|operation|required_quality": 20,
    "operations_1|operation|name": "LEADING",
    "operations_1|operation|leading": 3,
}

```

The number after the underscore is the repeat index, starting at 0.

### Map-over a collection (run a per-dataset tool on every element)

```python
inputs = {
    "input": {
        "batch": True,
        "values": [{"src": "hdca", "id": collection_id}],
    }
}

```

Result is an `implicit_collections[]` entry, not `outputs[]`. See `references/input-dict-patterns.md` for batch+linked, batch+unlinked (Cartesian), and `map_over_type` for nested collections.

## Gotchas (top 3 inline; rest in `galaxy-mcp-gotchas`)

1. **`state: ok` is not evidence of correctness.** Always preview the output. If it's empty, the input dict was probably wrong.
2. **The first run of a tool you've never used needs the discovery triad.** Skipping `get_tool_details` + `get_tool_run_examples` is the single largest source of wasted MCP calls.
3. **Don't make up tool IDs.** Always search first. Tool IDs change between Galaxy versions and between the public server vs private instances.

## Example — generic single-input tool, end-to-end

The shape below works for any single-input analysis tool. Substitute the tool id, parameter names, and dataset ids from your own discovery calls.

```python
# 1) Discover — take the top hit
hits = search_tools_by_name(query="<tool>")
tool_id = hits[0]["id"]   # full ToolShed id, latest version

# 2) Examples first (cheap) — they usually show the exact dict shape
examples = get_tool_run_examples(tool_id=tool_id)
# Read one or two; copy the key shape.

# 3) Schema (Tiered Strategy)
#    schema_sig = get_tool_details(tool_id=tool_id, io_details=False)
#    Only use io_details=True if needed, and slice the response with jq.
#    For aligners: Inject the target genome build directly from your execution plan!

# 4) Build inputs from the example shape and run
inputs = {
    "<input_param>": {"src": "hda", "id": input_dataset_id},
    # ... conditional params with pipe notation, repeats with _0|, _1| prefixes
}
result = run_tool(history_id=history_id, tool_id=tool_id, inputs=inputs)
output_id = result["outputs"][0]["id"]
job_id    = result["jobs"][0]["id"]

# 5) Poll to terminal state
#    MANDATORY ScheduleWakeup if job > 2 minutes.
#    If fast job, poll state only: get_dataset_details(dataset_id=output_id, include_preview=False)
#    new → queued → running → ok (or error → read stderr)
#    Hard cap: 60 minutes; on timeout report job_id and stop.

# 6) Sanity check (one preview, after ok)
preview = get_dataset_details(dataset_id=output_id, include_preview=True, preview_lines=10)
# If empty / 0-byte / wrong format → load galaxy-mcp-gotchas.

```

## References

* `references/efficient-discovery.md` — token-cost tactics for schemas, searches, polling, and previews. Read this whenever you're about to do extensive discovery on a new tool.
* `references/input-dict-patterns.md` — full input dict catalog: batch/linked/unlinked, map_over_type, repeats, conditionals, the values wrapper, and when each is required.
* `references/job-states.md` — state machine, polling cadence, hard timeout, stderr retrieval.