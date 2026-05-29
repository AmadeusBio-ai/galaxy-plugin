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
**Assembly resolution gate (mandatory)** — if `inputs` contains a `reference_genome|index`, a `genome`/`genomeSource` index parameter, or any other built-in reference picker tied to a Galaxy dbkey, resolve the build **from Galaxy's live option list** before calling `run_tool`. Do not pick a dbkey from memory, from `dbkey-reference.md`, or from a normalized base build.

If the protocol carries any version constraint ("latest", "newest", a patch like `p14`, a date, or a partial UI-label prefix), enumerate the tool's options and pick the matching label yourself:
- Call `get_tool_details(tool_id=TOOL, io_details=True)`, write the response to a temp file (or use the auto-saved path), then filter with `jq` by the **base species/build keyword** — never by the word "latest" (Galaxy uses dates and patch numbers, not that word). See `references/efficient-discovery.md`.
- Apply the rule that matches the constraint's own wording: "latest"/"newest" → most recent date, else highest patch; specific patch/date → exact match; partial UI-label prefix → the unique option whose label starts with that prefix; bare build with no modifier → the option with no patch suffix.

Then emit the ASSEMBLY ASSERTION block before `run_tool`:

```
ASSEMBLY ASSERTION
- Protocol asks for: "<verbatim quote from the protocol text — no paraphrase>"
- Galaxy candidates considered: <list of UI labels returned by jq from get_tool_details(io_details=True)>
- Picked: "<full UI label>" (option_value = "<dbkey/option id>")
- Why this satisfies the request: <one sentence — e.g., "highest patch number in candidates", "only option matching the literal label prefix">
```

Rules:
- Never skip this block. A missing block, or a `Picked` value drawn from memory / training data / the `dbkey-reference.md` fallback table while a constraint exists, is itself a defect — stop and fix it.
- The `Picked` value must come from Galaxy's live option list for **this tool** (a build's index value can differ across tool wrappers).
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
* `references/efficient-discovery.md` — Token-cost tactics for schemas and searches, plus the `jq` recipe for enumerating a reference-index picker's options to satisfy a version constraint.
* `references/input-dict-patterns.md` — Full input dict catalog (batch, conditionals).
* `references/job-states.md` — State machine and polling cadence.