# Galaxy dbkey (Genome Build) Reference

Galaxy uses the UCSC `dbkey` identifier for reference genome builds. The `dbkey` you set on an upload determines which reference-genome-aware tools (Bowtie2, BWA, htseq-count with a built-in GTF picker, etc.) will accept the dataset as input.

**Always set `dbkey` on uploads of genomic files** (FASTQ, BAM, BED, GTF, VCF). Skipping it is a frequent cause of "the tool can't find my input" errors.

> **For protocol runs and any "latest" / patched / dated genome requirement, the authoritative procedure lives in `skills/galaxy-tool-execution/references/assembly-resolution.md`.** This file's fallback table is for ad-hoc uploads only — see the guard at the bottom.

---

## TOP DIRECTIVE — Enumerate first, table second

When you are inside a protocol run (or any task that already names a tool you can query), the **first** thing you do for a genome decision is enumerate Galaxy's option list. The fallback table at the bottom of this file is for ad-hoc uploads with no tool context — it is **not** the primary path.

Order of operations:

1. Read the protocol's genome wording verbatim (quote it inside `<protocol-genome>...</protocol-genome>` in your plan). Do not paraphrase, do not append an example dbkey.
2. Identify the consuming tool (aligner, counter, variant caller, …). If none is named yet, defer the decision until one is.
3. Enumerate that tool's option list:
   ```bash
   # auto-saves the tool schema to <path>
   get_tool_details(tool_id=TOOL, io_details=True)

   # then filter to candidate options
   jq '.. | objects | select(.name=="index") | .options[]
       | select(.[0] | test("(?i)<base-species-or-build-keyword>"))' <path>
   ```
   See `skills/galaxy-tool-execution/references/efficient-discovery.md` for the full recipe.
4. Read the **full UI labels** returned. Galaxy labels carry **two** chronological signals — patch numbers (`p13`, `p14`, `Patch6`) AND release dates (`Dec. 2013`, `Jan. 2022`, `Feb. 2009`). Apply the protocol's resolution rule against whichever signal is present, preferring the more specific one when both are visible:
   - `"latest"` / `"newest"` → the option with the most recent **date** if dates are present, else the highest **patch number**. If both are present, the most recent date almost always corresponds to the highest patch — but if they disagree, prefer the date (a newer release supersedes an older patch line).
   - `"patch pN"` / `"pN"` → exact patch match.
   - `"<Month> <Year>"` or `"<Year>"` → exact date match.
   - bare species/build (e.g., `"mm10"`) with no modifier → the option whose label has neither a patch suffix nor a newer dated variant.
   - partial UI label prefix (e.g., `"Human (Homo sapiens) (b38):"`) → the option whose label starts with that exact prefix.

   Example label shapes you may see for the same human build:
   - `Human Dec. 2013 (GRCh38/hg38) (hg38)` — base, dated.
   - `Human Jan. 2022 (GRCh38.p14) (hg38_p14)` — patched, dated.
   - `Human (Homo sapiens) (b38): GRCh38/hg38` — undated prefix style.

   Never search the option strings for the literal word "latest" — Galaxy never writes "latest" into a label.
5. Emit the `ASSEMBLY ASSERTION` block (see `galaxy-tool-execution` SKILL step 4) before calling `run_tool` or any `upload_*` with a `dbkey=` argument.

The fallback table at the bottom is consulted **only** when steps 2–3 are impossible (e.g., a bare upload with no tool yet identified, and no version modifiers in the user request).

---

## CRITICAL DIRECTIVE: Assembly Precision and "Latest" Versions

Choosing the incorrect genome assembly is a catastrophic failure. It results in misaligned reads, wasted compute time, exhausted quotas, and compromised scientific results.

Users often use natural language to request specific variations of a genome, such as **"latest"**, **"patched"**, or specific version numbers (e.g., **"p11"**, **"patch 14"**).

**You must NEVER eagerly normalize or strip these modifiers when planning, summarizing, or delegating tasks to subagents.**

### The `mm10` vs `mm10Patch6` Failure Mode

If a user instruction says: *"Run Bowtie2 against the latest mouse GRCm38 assembly"*, do **NOT** map this to the base `mm10` (e.g., `Mouse Dec. 2011 (GRCm38/mm10)(mm10)`).

You must recognize the word "latest" and dynamically search the tool's available options to find the most recent patch, such as `GRCm38.p6 (mm10Patch6)`.

### Rules for Handling Natural Language Genome Requests

1. **Preserve modifiers in delegation:** When a parent agent spawns a subagent (e.g., `galaxy-operator`), the prompt must retain exact quotes of the user's genome requirements (e.g., "Use the latest GRCm38 patch"). Do not reduce it to "Use genome GRCm38". Do **not** attach a worked dbkey example (no `"latest GRCh38" → hg38`); the downstream agent treats appended dbkeys as authoritative equivalences and skips the Galaxy lookup.
2. **Dynamic lookups for specificity:** If the prompt contains modifiers like "latest", "newest", "Patch X", "pX", or specific release years, you must query the aligner's `reference_genome` options via `get_tool_details(<tool_id>, io_details=True)` plus `jq` (per `efficient-discovery.md`).
3. **Parse tool options carefully:** Look at the exact strings returned by Galaxy (e.g., `mm10Patch6` vs `mm10`). Select the one that satisfies the user's chronological or patch-specific constraints.

### Anti-pattern — the lab-7.1 incident

A real failure observed in production:

- Protocol text said: `"the latest assembly of GRCh38"` and (later) `"Select reference genome: Human (Homo sapiens) (b38):"` (a Galaxy UI label *prefix* with no value).
- The parent agent wrote a delegation prompt with: `Preserve exact genome specifications (e.g., "latest assembly of GRCh38", "Human (Homo sapiens) (b38): hg38") without normalizing.`
- The example `"... (b38): hg38"` was a synthetic worked equivalence the parent invented. The subagent treated it as canonical and submitted `dbkey="hg38"` (base GRCh38, unpatched) — directly violating the "latest" constraint.

**Do not do this.** Quote protocol genome text verbatim. Never attach a normalized dbkey alongside the quote. The downstream resolution must come from `get_tool_details(..., io_details=True)`, not from your training-data knowledge of `GRCh38 ≡ hg38`.

---

## Setting dbkey on an existing dataset

If you forgot to set `dbkey` on upload, or uploaded the wrong patch version, you cannot change it via the MCP cleanly. Re-uploading with the correct `dbkey` is the path of least resistance. (The UI's "edit attributes" pane can change it, but no MCP tool exposes that today.) Ensure you get it right the first time by enumerating before uploading.

---

## Fallback: Generic dbkey Values

**ONLY** use the following table if all of the following hold:

- The task is an ad-hoc upload with no protocol context.
- The user named a genome (e.g., "mm10", "mouse reference") with **absolutely no** version constraints, patch numbers, or chronological modifiers (like "latest").
- No consuming tool has been identified yet (so you cannot enumerate options).

If you are inside a `galaxy-run-protocol` execution, you are **never** in this case — the protocol has a tool, enumerate it.

The "UI label prefix" column shows the literal string you should expect at the start of an `options[][0]` value when you do enumerate. The bare dbkey in the third column is rarely the full `options[][1]` value (which often carries patch suffixes like `_p14`); confirm by enumeration before using.

| Organism | Build | UI label prefix you'll see in `options[]` | Generic dbkey fallback |
| --- | --- | --- | --- |
| Human | GRCh38 / hg38 | `Human (Homo sapiens) (b38):` | `hg38` |
| Human | GRCh37 / hg19 | `Human (Homo sapiens) (b37):` | `hg19` |
| Human | NCBI36 / hg18 | `Human (Homo sapiens) (b36):` | `hg18` |
| Mouse | GRCm39 / mm39 | `Mouse (Mus musculus) (mm39):` | `mm39` |
| Mouse | GRCm38 / mm10 | `Mouse (Mus musculus) (mm10):` | `mm10` |
| Mouse | NCBI37 / mm9 | `Mouse (Mus musculus) (mm9):` | `mm9` |
| Rat | mRatBN7.2 / rn7 | `Rat (Rattus norvegicus) (rn7):` | `rn7` |
| Rat | rn6 | `Rat (Rattus norvegicus) (rn6):` | `rn6` |
| Zebrafish | GRCz11 / danRer11 | `Zebrafish (Danio rerio) (danRer11):` | `danRer11` |
| Drosophila | dm6 | `Fruit Fly (Drosophila melanogaster) (dm6):` | `dm6` |
| Drosophila | dm3 | `Fruit Fly (Drosophila melanogaster) (dm3):` | `dm3` |
| C. elegans | ce11 | `Worm (Caenorhabditis elegans) (ce11):` | `ce11` |
| S. cerevisiae | sacCer3 | `Yeast (Saccharomyces cerevisiae) (sacCer3):` | `sacCer3` |
| A. thaliana | TAIR10 / araTha1 | `Arabidopsis thaliana (araTha1):` | `araTha1` |
| E. coli K-12 MG1655 | eschColi_K12 | `Escherichia coli K-12 MG1655:` | `eschColi_K12` |

Treat the UI-label-prefix column as illustrative — Galaxy instances vary in exact wording (some include the date, e.g., `Human Dec. 2013 (GRCh38/hg38)`). The enumeration step is authoritative; this table is a fallback shape, not ground truth.

For organisms not listed, or to verify patches: search the Galaxy UI's "Reference genome" dropdown on any aligner tool, or call `get_tool_details(<aligner tool id>, io_details=True)` and read the `options` list for the `reference_genome` (or equivalent) parameter.
