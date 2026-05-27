# Efficient Discovery — Tool Schemas, Searches, Polling, Previews

The MCP server is happy to hand you huge responses. Most of the bytes are noise. Four patterns below cover the biggest token sinks; following them tends to halve the context spend of a typical Galaxy run.

**CRITICAL CONTEXT RULE:** Reading more than 50KB of tool metadata into your context window is a failure. If a tool schema dump or metadata response is large enough to be auto-saved to a file, you MUST NOT read the whole file into context. You MUST use targeted `jq` queries on the saved result file to extract only what you need.

## 1. `get_tool_details` for tools with built-in reference indices

**Symptom:** the response runs hundreds of KB and gets auto-saved to a file with a "result exceeds maximum allowed tokens" error.

**Cause:** the `options` array of a `reference_genome|index` (or `reference_source|ref_file`) parameter lists every cached genome on the server. Bowtie2, BWA, HISAT2, STAR, minimap2, Salmon, kallisto, and htseq-count (in `reference_source=cached` mode) all have this. The actual schema you need is ~5 KB; the options list is ~500 KB.

**Fix — prefer `get_tool_run_examples` first:**

```python
examples = get_tool_run_examples(tool_id=TOOL)
# Read one example dict. It shows the conditional structure (pipe-notation keys),
# the source-kind wrappers ("src": "hda"), and which params are required.
# 95% of the time this is enough to write the inputs dict.

```

**Fix — Tiered Tool Information Retrieval ("Signature-Only" check):**

Instead of reading the full tool details, introduce a "Signature-Only" check. Use a `jq` command to extract a high-level signature (just the input names, types, and whether they are required) directly from the cached tool schema file.

```bash
# Extract high-level signature without the options/metadata bloat
jq '.data.inputs | map({name, type, optional})' <path>

```

**Fix — Truncate Parameter Enumerations (The "Genome List" Fix):**

You are **explicitly forbidden** from reading the `options` array for common reference-index pickers (Bowtie2, BWA, etc.) into your context.

**Exception:** If the user specifies a specific assembly version, "latest", a patch, or any natural language constraint beyond the generic species name (e.g., "latest human", "Patch11", "GRCm39"), you must **not** blindly guess the base `dbkey`. 

Instead, use a targeted `jq` query to retrieve all available options for the *base* genome (e.g., searching for `hg38` or `GRCh38`). You must then read the returned option strings and manually select the one that satisfies the user's chronological constraint (e.g., highest patch number, most recent date) or specific version. 

**CRITICAL**: Do NOT search the options array for the word "latest" itself. Galaxy option strings contain dates and patch numbers (e.g., `GRCh38.p11 Jun. 2017 (hg38Patch11)`), not the word "latest".

```bash
# Extract all options matching the base genome (e.g., 'hg38' or 'GRCh38') to manually find the latest patch or specific version
jq '.data.inputs | .. | objects | select(.name=="index") | .options[]? | select(.[0] | test("(?i)<base_genome_keyword>"))' <path>
```

If the user does *not* specify a constraint and just says "human" or "hg38", you should "guess" the value based on standard dataset namespaces (e.g., `hg38`, `mm10`, `dm6`). You don't need to enumerate the options to know the base dbkey. Set it directly:

```python
inputs = {
    "reference_genome|source": "indexed",
    "reference_genome|index":  "hg38",
}
```

If the server doesn't have that index cached, `run_tool` fails with a clear error — much cheaper than a 500 KB schema dump up-front.

If you absolutely must inspect the parameter schema to know its exact name or structure, use `jq` to extract the parameter's basic information while **explicitly discarding** the options array:

```bash
# Pull just the parameter name, type, and default (discards the massive options array):
jq '.data.inputs | .. | objects | select(.name=="index") | {name, type, default: .value}' <path>

```

**Fix — targeted `jq` queries for deep conditionals:**

If you need deeper structure beyond the signature, query the saved file specifically instead of reading it:

```bash
# Inspect one conditional's structure (cases + their test_param):
jq '.data.inputs | map(select(.name=="library")) | .[0]
    | {name, test_param: .test_param.name,
       cases: [.cases[] | {value, inputs: [.inputs[] | {name, type, value}]}]}' <path>

# Find a specific parameter (e.g., save_mapping_stats):
jq '.data.inputs | .. | objects | select(.name=="save_mapping_stats")' <path>

```

## 2. `search_tools_by_name` — take the top hit

**Symptom:** searching for "bowtie2" returns 22 results, including unrelated QIIME2 tools. Searching for "trimmomatic" returns 8 versions of the same tool.

**Cause:** the search returns every cached version plus near-name matches. Each hit is ~3 KB.

**Fix:**

* The first hit is usually what you want — Galaxy returns the most-recent revision of the most-popular tool first.
* If the search is ambiguous, switch to `search_tools_by_keywords` with two specific terms (`["bowtie2", "alignment"]` filters out the QIIME2 wrappers).
* Don't read past the first 2-3 hits — pick or refine the query.

```python
hits = search_tools_by_name(query="<tool>")
tool_id = hits[0]["id"]   # full ToolShed id with latest version

```

If you've used the same tool before in this conversation, skip the search entirely and reuse the id.

## 3. Polling — MCP only, state only

**Two failures to avoid:**

### 3a. Don't poll via `curl` from Bash

The MCP server has Galaxy credentials. The agent's shell does not — `$GALAXY_URL` and `$GALAXY_API_KEY` are not exported into the agent's environment, and attempting to `source` the user's `.env` is blocked (it's credential storage). A background `curl` loop will silently produce empty responses on every iteration.

**Correct:**

```python
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

* Expected < 5 min: `ScheduleWakeup(delaySeconds=270)` (stays in cache TTL)
* Expected 5-30 min: `ScheduleWakeup(delaySeconds=1200)` (one cache miss buys a long wait)
* Expected > 30 min: `ScheduleWakeup(delaySeconds=1800)` and accept the cache miss

On wake, do one MCP poll. If still running, schedule another wakeup. This burns ~1 cache miss per check instead of N polls × full BAM details.

## 4. Don't re-fetch what you already have

Within a single agent turn / context window:

* A tool's schema doesn't change. Fetch once, reuse.
* A dataset's `id` and `extension` don't change. Fetch once, reuse.
* An upload's URL→dataset mapping doesn't change. Don't re-upload to "be safe".

Galaxy de-duplicates `run_tool` submissions against the same inputs (returns the existing dataset rather than queuing a new job). This is a feature — exploit it to make re-runs cheap, but it also means a polling call against the dataset id you already have is the right call, not a fresh `run_tool`.

## Quick checklist

Before any large MCP call, ask:

* Is this an aligner / index-picker tool? → examples first, not full details. If you must inspect, use Signature-Only `jq` extraction.
* Am I about to load >50KB of metadata into context? → Stop, use `jq`.
* Have I already searched for this tool this turn? → reuse the id.
* Am I in a polling loop? → `include_preview=False`.
* Am I about to `curl` Galaxy? → stop, use the MCP.
* Is this a long job? → `ScheduleWakeup`, not a tight loop.