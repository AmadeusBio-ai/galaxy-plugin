---
name: galaxy-tool-execution
description: Run Galaxy tools end-to-end via the galaxy-mcp server — search the toolbox by name or keyword, inspect a tool's input schema with get_tool_details, look up working examples with get_tool_run_examples, construct a correct inputs dict (including src:hda dataset refs and pipe-notation for conditional parameters), invoke run_tool, and poll get_job_details until the job reaches ok or error. Use this whenever the user wants to run, invoke, queue, or execute a named Galaxy tool (Trimmomatic, Bowtie2, BWA, htseq-count, FastQC, samtools, etc.), find a tool that does X, or monitor a running/queued/errored Galaxy job.
disable-model-invocation: true
---

# Galaxy Tool Execution

<when_to_use>
* "Run <tool> with these params on my dataset"
* "Find a tool that does X" (adapter trimming, peak calling, variant calling, etc.)
* "Run the aligner against <genome> and save the mapping stats"
* "My job 4f3e… has been queued for 20 minutes — what's going on?"
* "The tool finished ok but produced a 0-byte / empty output" → load `galaxy-mcp-gotchas` first.

Not for:
* Uploading data or managing histories (use `galaxy-histories-and-data`)
* Multi-step canned pipelines >3 chained tools (use `galaxy-workflows`)
* Collection-specific tools like `__FILTER_FROM_FILE__` or Apply Rules (use `galaxy-collections`)
</when_to_use>

<instructions>
Ensure MCP is connected, a history exists, and input datasets are `ok`.
Execute tools using the discovery → run → poll triad:

1. Discover the tool
Use `search_tools_by_name(query="<tool>")` or `search_tools_by_keywords(keywords=["<topic>"])`.
Pick the full ToolShed ID from the top hit. Do not enumerate versions.

2. Inspect the schema
Prioritize signature retrieval: `get_tool_details(tool_id=TOOL, io_details=False)`.
For aligners/index pickers: Do NOT fetch the list of available genomes (io_details=True). Supply target genome build directly.
If full parameter tree is needed, use `jq` to slice the response.

3. Look up real examples
Always use `get_tool_run_examples(tool_id=TOOL)` as your template for exact pipe-notation and wrapper conventions.

4. Run
**Assembly registry gate (mandatory)** — if `inputs` contains a `reference_genome|index`, a `genome`/`genomeSource` index parameter, or any other built-in reference picker tied to a Galaxy dbkey, you MUST go through the registry **before** calling `run_tool`. Full procedure: `references/assembly-resolution.md`. In brief:

```bash
# 1. Read the registry for this history + build family.
node "$CLAUDE_PLUGIN_ROOT/bin/galaxy-assembly-registry.js" read \
    --history-id "$HID" --build-family "$BUILD_FAMILY"
# exit 3 -> STOP. Run Phase 0 resolution (assembly-resolution.md §4), then set-assembly, then retry.
# exit 0 -> JSON gives .assembly.upload_dbkey + .assembly.tool_indexes[<TOOL>]
```

If `tool_indexes[<TOOL>]` is missing, resolve once for this tool (filter `get_tool_details(io_details=True)` options with `jq` by base build keyword, apply the same `rule_applied` stored in the registry), then write back:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/galaxy-assembly-registry.js" add-tool-index \
    --history-id "$HID" --build-family "$BUILD_FAMILY" \
    --tool-id "$TOOL" --param "reference_genome|index" --option-value "$OPTION_VALUE"
```

Then emit the ASSEMBLY ASSERTION block before `run_tool`. The `Source:` line is mandatory — it makes transcripts auditable:

```
ASSEMBLY ASSERTION
- Protocol asks for: "<verbatim quote from the protocol text — no paraphrase>"
- Source: registry [outputs/.galaxy-context/<history_id>.json]   (or: just-resolved (writing back now))
- Galaxy candidates considered: <list of UI labels returned by jq from get_tool_details(io_details=True)>
- Picked: "<full UI label>" (option_value = "<dbkey/option id>")
- Why this satisfies the request: <one sentence — e.g., "highest patch number in candidates", "only option matching the literal label prefix">
```

Rules:
- Never skip this block. A missing block, or a `Source:` of "memory"/"training data"/"fallback table", is itself a defect — stop and fix it.
- The "Picked" `option_value` must come from the registry (`tool_indexes[<TOOL>].option_value`) or, if it was just resolved this turn, from the live Galaxy option list **and** must be written back via `add-tool-index` before `run_tool`. Never from `dbkey-reference.md` and never from training data.
- If the option list is empty for the species, stop and ask the user.

Then invoke `run_tool(history_id=H, tool_id=TOOL, inputs=INPUTS)`. Save dataset IDs immediately.

5. Poll to terminal state
For jobs >2 mins, `ScheduleWakeup` is mandatory. Do not busy-loop.
Poll state using: `get_dataset_details(dataset_id=D, include_preview=False)` or `get_job_details(dataset_id=D)`.
States: new → queued → running → ok | error.
Hard timeout: 60 minutes. On error, report `stderr`. Never poll via bash `curl`.

6. Verify outputs by contents
After `ok`, confirm output: `get_dataset_details(dataset_id=D, include_preview=True, preview_lines=15)`.
If empty/0-byte/wrong format, load `galaxy-mcp-gotchas`.

Critical Patterns:
- `src: "hda"` for datasets, `src: "hdca"` for collections. Example: `{"src": "hda", "id": fastq_dataset_id}`.
- Pipe notation for conditionals: `"operations_0|operation|name": "SLIDINGWINDOW"`, not nested dicts.
- Repeats use indexed prefixes: `"operations_0|...", "operations_1|..."`.
- Map-over collection: `{"input": {"batch": True, "values": [{"src": "hdca", "id": collection_id}]}}`.

Gotchas:
- `state: ok` is not evidence of correctness. Always preview output.
- The first run of a new tool requires the discovery triad to prevent wasted calls.
- Never guess tool IDs; always search first.
</instructions>

<example>
# Generic single-input tool, end-to-end
hits = search_tools_by_name(query="<tool>")
tool_id = hits[0]["id"]

examples = get_tool_run_examples(tool_id=tool_id)

inputs = {
    "<input_param>": {"src": "hda", "id": input_dataset_id},
}
result = run_tool(history_id=history_id, tool_id=tool_id, inputs=inputs)
output_id = result["outputs"][0]["id"]

# Poll (ScheduleWakeup if >2min)
get_dataset_details(dataset_id=output_id, include_preview=False)

# Sanity check after ok
preview = get_dataset_details(dataset_id=output_id, include_preview=True, preview_lines=10)
</example>

## References
* `references/assembly-resolution.md` — **Canonical**. Per-history registry path + schema, the three gates (Gate A on uploads, Gate B on reference-touching tools, Gate C on write-back), Phase 0 resolution rules, ASSEMBLY ASSERTION block. Read whenever the task involves an aligner or any built-in reference picker; conflicts with other docs are decided here.
* `references/efficient-discovery.md` — Token-cost tactics for schemas and searches.
* `references/input-dict-patterns.md` — Full input dict catalog (batch, conditionals).
* `references/job-states.md` — State machine and polling cadence.