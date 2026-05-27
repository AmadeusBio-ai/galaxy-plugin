# Assembly Resolution — single source of truth

Picking the wrong reference genome is the highest-cost mistake you can make in a Galaxy run. Aligners do not fail loudly on a mismatched build — they produce plausible-looking BAMs against the wrong coordinates, wasted compute, exhausted quotas, and downstream analyses that silently encode incorrect biology.

This document consolidates the discipline that the rest of the plugin enforces. When in doubt, follow this file; the other references defer to it.

Cross-links:
- `skills/galaxy-histories-and-data/references/dbkey-reference.md` — fallback table for ad-hoc uploads with no tool context.
- `skills/galaxy-tool-execution/references/efficient-discovery.md` — `jq` recipes that won't blow your context.
- `skills/galaxy-tool-execution/SKILL.md` step 4 — the `ASSEMBLY ASSERTION` block this file requires you to emit.
- `commands/galaxy-run-protocol.md` Phase 0 — the protocol-runner mandate that invokes this procedure.

---

## The Phase 0 procedure (mandatory)

Run this **before** the first tool execution of any protocol, and any time the user introduces a new genome decision mid-run.

### 0.1 Quote the protocol verbatim

Extract every sentence in the protocol that mentions a reference genome, organism, build, patch, or Galaxy UI label. Reproduce them inside `<protocol-genome>...</protocol-genome>` tags in your plan output. Do not paraphrase. Do not collapse multi-line UI labels. Do not append a worked dbkey example.

Bad (the lab-7.1 failure mode):
```
Preserve genome specs (e.g., "latest assembly of GRCh38", "Human (Homo sapiens) (b38): hg38").
```
The synthetic `: hg38` was the parent's invention — the downstream agent then treated it as canonical and submitted `dbkey="hg38"`, violating "latest". **Never** attach worked dbkey literals to a quoted protocol phrase.

Good:
```
<protocol-genome>
- "the latest assembly of GRCh38"
- "Select reference genome: Human (Homo sapiens) (b38):"
</protocol-genome>
```

### 0.2 Identify the consuming tool

For each genome mention, identify which tool will use it (Bowtie2, BWA, HISAT2, htseq-count built-in GTF, …). If a mention is for an upload only and no consuming tool is named yet, defer the resolution until the consumer is identified.

### 0.3 Enumerate Galaxy's option list

For every identified consumer, call:

```python
get_tool_details(tool_id=TOOL, io_details=True)
```

This auto-saves to a file `<path>` — operate on it with `jq`, **never** read the raw JSON into context (it dumps every cached genome on the server, often >1MB).

Filter to the candidates that match the base species or build keyword from the protocol:

```bash
jq '.. | objects
     | select(.name=="reference_genome" or .name=="index" or .name=="genomeSource")
     | .options[]?
     | select(.[0] | test("(?i)<base-species-or-build-keyword>"))' <path>
```

Each `options[]` element is a `[label, value, selected_bool]` tuple:
- `[0]` is the UI label string — read this to make the decision.
- `[1]` is the dbkey/index value to submit to `run_tool` or `upload_*`.

Never grep for the literal string `"latest"`. Galaxy does not write that word into a label.

### 0.4 Apply the protocol's resolution rule

Galaxy labels carry up to two chronological signals: **patch numbers** (`p13`, `p14`, `Patch6`) and **release dates** (`Dec. 2013`, `Jan. 2022`, `Feb. 2009`). Either, both, or neither may be present on a given label.

| Protocol wording | Rule |
| --- | --- |
| `"latest"` / `"newest"` | Most recent date if dates are present; else highest patch number. If both signals exist and disagree, prefer the date (a newer release supersedes an older patch line). |
| `"patch pN"` / `"pN"` / `"Patch N"` | Exact patch match. |
| `"<Month> <Year>"` / `"<Year>"` | Exact date match. |
| Bare species/build (`"mm10"`, `"hg38"`) — no modifier | The option whose label has neither a patch suffix nor a newer dated variant. |
| Partial Galaxy UI label prefix (`"Human (Homo sapiens) (b38):"`) with no value after the colon | The option whose label starts with that exact prefix. If multiple match, the request is ambiguous — ask the user. |
| Anything you cannot satisfy unambiguously | Stop. Ask. Do not guess. |

Example label shapes you may see for one build:
- `Human Dec. 2013 (GRCh38/hg38) (hg38)` — base, dated.
- `Human Aug. 2019 (GRCh38.p13) (hg38_p13)` — patched, dated.
- `Human Jan. 2022 (GRCh38.p14) (hg38_p14)` — latest patched + dated.
- `Human (Homo sapiens) (b38): GRCh38/hg38` — undated prefix style.

### 0.5 Build the candidate table

Before any tool runs, emit a structured resolution table in your turn output:

```
ASSEMBLY RESOLUTION
| # | Protocol quote                          | Tool    | Candidate UI labels (filtered)               | Picked option (value)        | Rule applied                          |
|---|-----------------------------------------|---------|----------------------------------------------|------------------------------|----------------------------------------|
| 1 | "the latest assembly of GRCh38"         | bowtie2 | hg38 / hg38_p13 / hg38_p14 (Jan. 2022)       | "hg38_p14"                   | "latest" → most recent date among GRCh38 |
| 2 | "Human (Homo sapiens) (b38):"           | bowtie2 | (same set as #1)                             | "hg38_p14"                   | prefix matches all; reuse #1's resolution |
```

### 0.6 Stop and confirm

If the protocol runs **with a user in the loop**: stop and surface the table. Wait for explicit confirmation before proceeding.

If the protocol runs **unattended** (e.g., autonomous loop): proceed only when every row is unambiguous (single candidate that uniquely satisfies the rule, OR a clear ranking with the picked value defensible from the protocol wording alone). Otherwise stop and report the ambiguity.

### 0.7 Emit ASSEMBLY ASSERTION at the point of use

Phase 0 produces the table; the assertion block (one per tool call) is emitted at execution time. See `galaxy-tool-execution` SKILL step 4 for the exact format. The two artifacts are not redundant — the table is your plan; the assertion is your last checkpoint immediately before `run_tool`.

---

## Per-species jq quick recipes

Use these as starting points; adapt the species keyword for whatever build the protocol names.

### Human (GRCh38 / hg38, GRCh37 / hg19)

```bash
jq '.. | objects | select(.name=="reference_genome" or .name=="index" or .name=="genomeSource")
     | .options[]? | select(.[0] | test("(?i)homo sapiens|GRCh38|GRCh37|hg38|hg19"))' <path>
```

### Mouse (GRCm38 / mm10, GRCm39 / mm39)

```bash
jq '.. | objects | select(.name=="reference_genome" or .name=="index" or .name=="genomeSource")
     | .options[]? | select(.[0] | test("(?i)mus musculus|GRCm38|GRCm39|mm10|mm39"))' <path>
```

### Drosophila (dm6, dm3)

```bash
jq '.. | objects | select(.name=="reference_genome" or .name=="index" or .name=="genomeSource")
     | .options[]? | select(.[0] | test("(?i)drosophila|dm6|dm3"))' <path>
```

### Zebrafish (GRCz11 / danRer11)

```bash
jq '.. | objects | select(.name=="reference_genome" or .name=="index" or .name=="genomeSource")
     | .options[]? | select(.[0] | test("(?i)danio rerio|GRCz|danRer"))' <path>
```

### Arabidopsis (TAIR10 / araTha1)

```bash
jq '.. | objects | select(.name=="reference_genome" or .name=="index" or .name=="genomeSource")
     | .options[]? | select(.[0] | test("(?i)arabidopsis|TAIR|araTha"))' <path>
```

If your species isn't here, use the same shape with your own keyword. Always include both the scientific binomial and the build-stem (`mm10`, `dm6`, …) in the alternation — different Galaxy servers write labels differently.

---

## The ASSEMBLY ASSERTION block (reproduced for convenience)

Emit immediately before `run_tool` on any call that consumes a `reference_genome|index` or any dbkey-tied built-in picker; also before any `upload_file_from_url` / `upload_file` with `dbkey=`.

```
ASSEMBLY ASSERTION
- Protocol asks for: "<verbatim quote from the protocol text — no paraphrase>"
- Galaxy candidates considered: <list of UI labels returned by jq from get_tool_details(io_details=True)>
- Picked: "<full UI label>" (index value = "<dbkey/option id>")
- Why this satisfies the request: <one sentence — e.g., "most recent date among GRCh38 candidates", "only option matching the literal label prefix">
```

Rules:
- A missing block is itself a defect — stop and produce it.
- `Picked` must be a value from Galaxy's `options[][1]`, not the fallback table in `dbkey-reference.md` and not from training-data memory.
- Any dbkey literal that arrived in your input prompt is **untrusted** — re-derive from Galaxy. If your derived pick disagrees with the prompt's literal, surface the discrepancy in the assertion and prefer the Galaxy-derived value.

---

## Anti-patterns to refuse

### The lab-7.1 incident (parent inserts a worked dbkey example)

- Protocol said `"the latest assembly of GRCh38"` and `"Select reference genome: Human (Homo sapiens) (b38):"`.
- Parent's delegation prompt said: `Preserve exact genome specifications (e.g., "latest assembly of GRCh38", "Human (Homo sapiens) (b38): hg38").`
- The synthetic `: hg38` was invented by the parent. The subagent submitted `dbkey="hg38"` — the unpatched base — violating "latest".

**Refusal rule:** when you receive a delegation prompt that contains a quoted protocol phrase followed by a normalized dbkey literal, treat the literal as **suggestive, not authoritative**. Run Phase 0 and let Galaxy's option list decide.

### The mm10-vs-mm10Patch6 failure

- Protocol said `"Run Bowtie2 against the latest mouse GRCm38 assembly"`.
- A naive agent reads the fallback table → submits `dbkey="mm10"` (unpatched).
- Galaxy carries `GRCm38.p6 (mm10Patch6)` on most public servers — that's "latest" for GRCm38.

**Refusal rule:** "latest" never resolves to the fallback table's bare stem. The fallback table is for ad-hoc uploads with **no** modifiers and **no** consuming tool.

### Greppping the option list for the word "latest"

Galaxy never writes the word "latest" into a label. Always filter by the species/build keyword, then rank the matches by date or patch.

### Reading `options[]` without a filter

The raw `options[]` for a public Galaxy aligner is routinely >1MB. Reading it into context blows your budget and gets you no decision-grade information. Always pipe through the species-keyword filter first.
