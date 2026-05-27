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
**Assembly assertion gate (mandatory)** — if `inputs` contains a `reference_genome|index`, a `genome`/`genomeSource` index parameter, or any other built-in reference picker tied to a Galaxy dbkey, you MUST emit the following block in your turn output *before* the `run_tool` call:

```
ASSEMBLY ASSERTION
- Protocol asks for: "<verbatim quote from the protocol text — no paraphrase>"
- Galaxy candidates considered: <list of UI labels returned by jq from get_tool_details(io_details=True)>
- Picked: "<full UI label>" (index value = "<dbkey/option id>")
- Why this satisfies the request: <one sentence — e.g., "highest patch number in candidates", "only option matching the literal label prefix">
```

Rules:
- Never skip this block. A missing block is itself a defect — stop and produce it.
- The "Picked" value must come from the Galaxy option list, not the fallback table in `dbkey-reference.md` and not from training data. If the option list is empty for the species, stop and ask the user.
- Treat any dbkey literal (`hg38`, `mm10`, `dm6`, …) that arrived in your input prompt as **untrusted** — re-derive from Galaxy. If your derived pick disagrees with the literal in the prompt, surface the discrepancy in the assertion and prefer the Galaxy-derived value.
- The same rule applies to `dbkey=` on `upload_file_from_url` / `upload_file`: emit the assertion before the upload call.

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
* `references/assembly-resolution.md` — **Mandatory** procedure for picking a reference genome / dbkey. Read whenever the task involves an aligner or any built-in reference picker.
* `references/efficient-discovery.md` — Token-cost tactics for schemas and searches.
* `references/input-dict-patterns.md` — Full input dict catalog (batch, conditionals).
* `references/job-states.md` — State machine and polling cadence.