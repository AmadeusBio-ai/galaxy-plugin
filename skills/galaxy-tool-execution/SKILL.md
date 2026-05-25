---
name: galaxy-tool-execution
description: Run Galaxy tools end-to-end via the galaxy-mcp server — search the toolbox by name or keyword, inspect a tool's input schema with get_tool_details, look up working examples with get_tool_run_examples, construct a correct inputs dict (including src:hda dataset refs and pipe-notation for conditional parameters), invoke run_tool, and poll get_job_details until the job reaches ok or error. Use this whenever the user wants to run, invoke, queue, or execute a named Galaxy tool (Trimmomatic, Bowtie2, BWA, htseq-count, FastQC, samtools, etc.), find a tool that does X, or monitor a running/queued/errored Galaxy job.
disable-model-invocation: true
---

# Galaxy Tool Execution

The most-used skill in the plugin. Owns the discovery → invocation → monitoring loop for any Galaxy tool. The hardest part is constructing the `inputs` dict — Galaxy tool XML uses conditionals and repeats that don't map to flat Python dicts, and a wrong shape silently produces garbage output rather than an error.

## When to use

- "Run Trimmomatic on my fastq with SLIDINGWINDOW 4/20"
- "Find a tool for trimming Illumina adapters"
- "Run Bowtie2 against hg38 and save the mapping stats"
- "My job 4f3e… has been queued for 20 minutes — what's going on?"
- "Why did htseq-count finish ok but produce a 0-byte counts file?" → first load `galaxy-mcp-gotchas`, then come back here.

**Not for**:
- Uploading data or managing histories — use `galaxy-histories-and-data`.
- Multi-step canned pipelines — check `galaxy-workflows` for an IWC workflow first if there are more than ~3 chained tools.
- Collection-specific tools (`__FILTER_FROM_FILE__`, Apply Rules) — use `galaxy-collections`.

## Prerequisites

- MCP connected (run `/galaxy-setup` if not).
- A history to write into.
- All input datasets uploaded and in state `ok`.

## Workflow — the discovery → run → poll triad

This is the discipline. Skipping any step is the cause of most `run_tool` failures.

### 1. Discover the tool
```
search_tools_by_name(query="trimmomatic")
# or
search_tools_by_keywords(keywords=["adapter", "trimming"])
```
Pick the **full ToolShed ID** (e.g., `toolshed.g2.bx.psu.edu/repos/pjbriggs/trimmomatic/trimmomatic/0.39+galaxy2`), not the short name. Short names work but aren't reproducible.

### 2. Inspect the schema
```
get_tool_details(tool_id=TOOL, io_details=True)
```
This returns the full parameter tree with names, types, defaults, options, and (critically) the conditional structure. Read it before writing the `inputs` dict — the structure tells you which parameters are conditional (will need pipe-notation) and which are repeats (will need indexed-`_0|`, `_1|` notation).

### 3. Look up real examples
```
get_tool_run_examples(tool_id=TOOL)
```
Returns the tool's XML test cases as actual input dicts. **Use these as your template.** They cover the exact pipe-notation and wrapper conventions for this specific tool — guessing is how you end up debugging silent failures.

### 4. Run
```
run_tool(history_id=H, tool_id=TOOL, inputs=INPUTS)
```
Response includes `outputs[]` (new datasets), `output_collections[]`, `implicit_collections[]`, and `jobs[]`. Save the relevant dataset IDs immediately.

### 5. Poll to terminal state
```
get_job_details(dataset_id=D)
# states: new → queued → running → ok | error
```

Poll every 30 seconds. Surface state transitions to the parent with timestamps. Hard timeout: 60 minutes per tool. On `error`, read `stderr` from the job details and report it — do not retry blindly.

See `references/job-states.md` for the full state machine.

### 6. Verify outputs by contents
After `state: ok`, confirm the output makes sense:
```
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

## Example — Trimmomatic SLIDINGWINDOW 4/20 on a single FASTQ

End-to-end, with the discovery triad and polling.

```
# 1) Discover
hits = search_tools_by_name(query="trimmomatic")
tool_id = "toolshed.g2.bx.psu.edu/repos/pjbriggs/trimmomatic/trimmomatic/0.39+galaxy2"

# 2) Inspect — confirm conditional structure
schema = get_tool_details(tool_id=tool_id, io_details=True)
# schema shows: readtype.single_or_paired (conditional), operations (repeat),
# operation.name (conditional within each repeat)

# 3) Examples — copy the working shape
examples = get_tool_run_examples(tool_id=tool_id)
# example shows operations_0|operation|name keys

# 4) Build inputs and run
inputs = {
    "readtype|single_or_paired": "single",
    "fastq_in": {"src": "hda", "id": fastq_dataset_id},
    "operations_0|operation|name": "SLIDINGWINDOW",
    "operations_0|operation|window_size": 4,
    "operations_0|operation|required_quality": 20,
}
result = run_tool(history_id=history_id, tool_id=tool_id, inputs=inputs)
trimmed_id = result["outputs"][0]["id"]
job_id = result["jobs"][0]["id"]

# 5) Poll every 30s with state transitions logged
#    new → queued → running → ok (or error → read stderr)
#    Hard cap: 60 minutes; on timeout report job_id and stop.

# 6) Sanity check
preview = get_dataset_details(dataset_id=trimmed_id, include_preview=True, preview_lines=4)
# Expect FASTQ records; empty or 0-byte → load galaxy-mcp-gotchas.
```

## References

- `references/input-dict-patterns.md` — full input dict catalog: batch/linked/unlinked, map_over_type, repeats, conditionals, the values wrapper, and when each is required.
- `references/job-states.md` — state machine, polling cadence, hard timeout, stderr retrieval.
