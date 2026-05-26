# Efficient Discovery — Tool Schemas, Searches, Polling, Previews

The MCP server is happy to hand you huge responses. Most of the bytes are noise. Four patterns below cover the biggest token sinks; following them tends to halve the context spend of a typical Galaxy run.

## 1. `get_tool_details` for tools with built-in reference indices

**Symptom:** the response runs hundreds of KB and gets auto-saved to a file with a "result exceeds maximum allowed tokens" error.

**Cause:** the `options` array of a `reference_genome|index` (or `reference_source|ref_file`) parameter lists every cached genome on the server. Bowtie2, BWA, HISAT2, STAR, minimap2, Salmon, kallisto, and htseq-count (in `reference_source=cached` mode) all have this. The actual schema you need is ~5 KB; the options list is ~500 KB.

**Fix — prefer `get_tool_run_examples` first:**

```
examples = get_tool_run_examples(tool_id=TOOL)
# Read one example dict. It shows the conditional structure (pipe-notation keys),
# the source-kind wrappers ("src": "hda"), and which params are required.
# 95% of the time this is enough to write the inputs dict.
```

**Fix — when you really need the schema, query the saved file with `jq`:**

If `get_tool_details` did dump to a file, run targeted queries instead of reading the whole thing:

```bash
# List top-level input names:
jq '[.data.inputs[].name]' <path>

# Inspect one conditional's structure (cases + their test_param):
jq '.data.inputs | map(select(.name=="library")) | .[0]
    | {name, test_param: .test_param.name,
       cases: [.cases[] | {value, inputs: [.inputs[] | {name, type, value}]}]}' <path>

# Find a specific parameter (e.g., save_mapping_stats):
jq '.data.inputs | .. | objects | select(.name=="save_mapping_stats")' <path>

# Pull just the picker name for a select param (without the full options list):
jq '.data.inputs | .. | objects | select(.name=="index")
    | {name, default: .value}' <path>
```

The `jq` calls return tens of bytes instead of hundreds of KB. Build the inputs dict from those.

**Fix — pick the index by name without inspecting the options list:**

For Bowtie2-family tools, the dbkey value (e.g., `hg38`, `mm10`, `dm6`) is the picker value. You don't need to enumerate the options to know it. Set:

```python
inputs = {
    "reference_genome|source": "indexed",
    "reference_genome|index":  "hg38",
}
```

If the server doesn't have that index cached, `run_tool` fails with a clear error — much cheaper than a 500 KB schema dump up-front.

## 2. `search_tools_by_name` — take the top hit

**Symptom:** searching for "bowtie2" returns 22 results, including unrelated QIIME2 tools. Searching for "trimmomatic" returns 8 versions of the same tool.

**Cause:** the search returns every cached version plus near-name matches. Each hit is ~3 KB.

**Fix:**

- The first hit is usually what you want — Galaxy returns the most-recent revision of the most-popular tool first.
- If the search is ambiguous, switch to `search_tools_by_keywords` with two specific terms (`["bowtie2", "alignment"]` filters out the QIIME2 wrappers).
- Don't read past the first 2-3 hits — pick or refine the query.

```
hits = search_tools_by_name(query="<tool>")
tool_id = hits[0]["id"]   # full ToolShed id with latest version
```

If you've used the same tool before in this conversation, skip the search entirely and reuse the id.

## 3. Polling — MCP only, state only

**Two failures to avoid:**

### 3a. Don't poll via `curl` from Bash

The MCP server has Galaxy credentials. The agent's shell does not — `$GALAXY_URL` and `$GALAXY_API_KEY` are not exported into the agent's environment, and attempting to `source` the user's `.env` is blocked (it's credential storage). A background `curl` loop will silently produce empty responses on every iteration.

**Correct:**

```
get_dataset_details(dataset_id=D, include_preview=False)
# or
get_job_details(dataset_id=D)
```

### 3b. Don't include the preview in polling iterations

`get_dataset_details(dataset_id=BAM, include_preview=True)` on a BAM dumps the full `@SQ` header — every reference contig (typically 200-500 for hg38, with names + lengths). That's ~30 KB *per poll*. On a 20-minute alignment polled every 30s, that's ~1.2 MB of redundant context.

**Pattern:**

```python
# In the wait loop — state only:
state = get_dataset_details(dataset_id=D, include_preview=False)["state"]

# Once state == "ok" — ONE preview, with bounded preview_lines:
preview = get_dataset_details(dataset_id=D, include_preview=True, preview_lines=15)
```

### 3c. Long jobs — use `ScheduleWakeup`, not busy loops

For anything > 2 minutes expected runtime (aligners, large counts, big workflows), schedule a single wakeup instead of polling continuously. Pick the delay based on expected runtime:

- Expected < 5 min: `ScheduleWakeup(delaySeconds=270)` (stays in cache TTL)
- Expected 5-30 min: `ScheduleWakeup(delaySeconds=1200)` (one cache miss buys a long wait)
- Expected > 30 min: `ScheduleWakeup(delaySeconds=1800)` and accept the cache miss

On wake, do one MCP poll. If still running, schedule another wakeup. This burns ~1 cache miss per check instead of N polls × full BAM details.

## 4. Don't re-fetch what you already have

Within a single agent turn / context window:

- A tool's schema doesn't change. Fetch once, reuse.
- A dataset's `id` and `extension` don't change. Fetch once, reuse.
- An upload's URL→dataset mapping doesn't change. Don't re-upload to "be safe".

Galaxy de-duplicates `run_tool` submissions against the same inputs (returns the existing dataset rather than queuing a new job). This is a feature — exploit it to make re-runs cheap, but it also means a polling call against the dataset id you already have is the right call, not a fresh `run_tool`.

## Quick checklist

Before any large MCP call, ask:

- Is this an aligner / index-picker tool? → examples first, not full details
- Have I already searched for this tool this turn? → reuse the id
- Am I in a polling loop? → `include_preview=False`
- Am I about to `curl` Galaxy? → stop, use the MCP
- Is this a long job? → `ScheduleWakeup`, not a tight loop
