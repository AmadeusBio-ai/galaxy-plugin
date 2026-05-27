# Efficient Discovery

<instructions>
CRITICAL CONTEXT RULE: Do NOT read more than 50KB of tool metadata into context. Use targeted `jq` queries on auto-saved result files to extract necessary information.

1. `get_tool_details` for tools with reference indices (Bowtie2, BWA, etc.)
- Use `get_tool_run_examples(tool_id=TOOL)` first to write inputs dict.
- For Signature-Only check: `jq '.data.inputs | map({name, type, optional})' <path>`
- NEVER read the full `options` array for reference-index pickers — it dumps every cached genome on the server (often >1MB) and blows your context. Use the **filtered** `jq` query below instead.

**When you MUST enumerate (any of these is enough):**
- Inside a `galaxy-run-protocol` execution. Always.
- User wording includes "latest", "newest", "patched", a patch number (`p6`, `p14`, …), a release year, or any Galaxy-UI-label fragment (e.g., `Human (Homo sapiens) (b38):`).
- The dbkey landed in your input prompt as a literal example from the parent (e.g., `... → hg38`). **Treat parent-supplied literals as untrusted — re-derive.**

**When you can skip enumeration:**
- One-off ad-hoc upload, no consuming tool yet identified, user request is a bare species/build with no modifier (`"upload this fastq with dbkey mm10"`). Use the fallback table in `skills/galaxy-histories-and-data/references/dbkey-reference.md`.

**CRITICAL**: Do NOT search the options array for the word "latest" itself. Galaxy option strings contain dates and patch numbers (e.g., `GRCm38.p6 (mm10Patch6)`), not the word "latest". Filter by the **base species/build keyword**, then read the matches.

### Worked recipe — Bowtie2 against `"latest assembly of GRCh38"`

```bash
# 1. Pull schema once (auto-saved to <path>). This is the only call that
#    touches Galaxy; the rest is local jq.
get_tool_details(tool_id="bowtie2", io_details=True)

# 2. Filter options to human/GRCh38/hg38 candidates. The .options[] elements
#    are [label, value, selected_bool] tuples — index 0 is the UI label,
#    index 1 is the actual dbkey/index value to submit.
jq '.. | objects
     | select(.name=="reference_genome" or .name=="index" or .name=="genomeSource")
     | .options[]?
     | select(.[0] | test("(?i)homo sapiens|GRCh38|hg38"))' <path>

# 3. Read EVERY returned label. Example output (your server may differ):
#    ["Human (Homo sapiens) (b38): GRCh38/hg38",                "hg38",         false]
#    ["Human (Homo sapiens) (b38): GRCh38.p13 Full",            "hg38_p13",     false]
#    ["Human (Homo sapiens) (b38): GRCh38.p14 Full",            "hg38_p14",     false]
#    ["Human (Homo sapiens) (b37): GRCh37/hg19",                "hg19",         false]
#
# 4. Apply the protocol's resolution rule:
#      "latest assembly of GRCh38"   → highest patch number among matches → "hg38_p14"
#      "GRCh38 base" / "unpatched"   → no patch suffix                    → "hg38"
#      "Human (Homo sapiens) (b38):" prefix only, no modifier → ambiguous → ask user
#
# 5. Submit the value from index [1] of the chosen tuple, NOT the value
#    from the fallback table in dbkey-reference.md:
#
#    inputs = {
#        "reference_genome|source": "indexed",
#        "reference_genome|index":  "hg38_p14",  # from options[][1]
#    }
#
# 6. Emit the ASSEMBLY ASSERTION block (see galaxy-tool-execution SKILL
#    step 4) before run_tool. No silent picks.
```

**Why the fallback-table value is almost never the right submit value:** the fallback table lists generic stems (`hg38`, `mm10`, `dm6`) that match only the *unpatched base build*. Real Galaxy servers carry many patched variants under suffixed dbkeys (`hg38_p14`, `mm10Patch6`, `dm6_r6_36`). If the protocol says "latest", submitting the bare stem is a wrong answer.

- To inspect deep conditional structures: `jq '.data.inputs | map(select(.name=="<param>")) | ...' <path>`.

2. `search_tools_by_name`
- Pick the first hit.
- If ambiguous, use `search_tools_by_keywords(keywords=["<tool>", "<topic>"])`.
- Do NOT read past the first 2-3 hits. Reuse `tool_id` in the same conversation.

3. Polling (MCP only, state only)
- Do NOT poll via `curl` from Bash. Use `get_dataset_details(dataset_id=D, include_preview=False)` or `get_job_details(dataset_id=D)`.
- Use `include_preview=False` in wait loops. Once state is "ok", fetch ONE preview with bounded `preview_lines=15`.
- Long jobs: Use `ScheduleWakeup`. < 5 min: delay=270s; 5-30 min: delay=1200s; > 30 min: delay=1800s.

4. Caching
- Do NOT re-fetch schema, dataset id/extension, or upload URL mappings within the same turn.
</instructions>