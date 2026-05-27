# Galaxy dbkey (Genome Build) Reference

Galaxy uses the UCSC `dbkey` identifier for reference genome builds. The `dbkey` you set on an upload determines which reference-genome-aware tools (Bowtie2, BWA, htseq-count with a built-in GTF picker, etc.) will accept the dataset as input.

**Always set `dbkey` on uploads of genomic files** (FASTQ, BAM, BED, GTF, VCF). Skipping it is a frequent cause of "the tool can't find my input" errors.

---

## CRITICAL DIRECTIVE: Assembly Precision and "Latest" Versions

Choosing the incorrect genome assembly is a catastrophic failure. It results in misaligned reads, wasted compute time, exhausted quotas, and compromised scientific results.

Users often use natural language to request specific variations of a genome, such as **"latest"**, **"patched"**, or specific version numbers (e.g., **"p11"**, **"patch 14"**).

**You must NEVER eagerly normalize or strip these modifiers when planning, summarizing, or delegating tasks to subagents.** ### The `hg38` vs `hg38Patch11` Failure Mode
If a user instruction says: *"Run Bowtie2 against the latest human GRCh38 assembly"*, do **NOT** map this to the base `hg38` (e.g., `Human Dec. 2013 (GRCh38/hg38)(hg38)`).

You must recognize the word "latest" and dynamically search the tool's available options to find the most recent patch, such as `GRCh38.p11 Jun. 2017 (hg38Patch11)`.

### Rules for Handling Natural Language Genome Requests:

1. **Preserve Modifiers in Delegation:** When a parent agent spawns a subagent (e.g., `galaxy-operator`), the prompt must retain exact quotes of the user's genome requirements (e.g., "Use the latest GRCh38 patch"). Do not reduce it to "Use genome GRCh38".
2. **Dynamic Lookups for Specificity:** If the prompt contains modifiers like "latest", "newest", "Patch X", "pX", or specific release years, you must query the aligner's `reference_genome` options via `get_tool_details(<tool_id>, io_details=True)` or `jq` (as described in `efficient-discovery.md`).
3. **Parse Tool Options Carefully:** Look at the exact strings returned by Galaxy (e.g., `hg38Patch11` vs `hg38`). Select the one that satisfies the user's chronological or patch-specific constraints.

---

## Fallback: Generic dbkey Values

**ONLY** use the following table if the user pastes a generic protocol that names a genome (e.g., "hg38", "human reference") with **absolutely no** version constraints, patch numbers, or chronological modifiers (like "latest").

| Organism | Build | Generic dbkey Fallback |
| --- | --- | --- |
| Human | GRCh38 / hg38 | `hg38` |
| Human | GRCh37 / hg19 | `hg19` |
| Human | NCBI36 / hg18 | `hg18` |
| Mouse | GRCm39 / mm39 | `mm39` |
| Mouse | GRCm38 / mm10 | `mm10` |
| Mouse | NCBI37 / mm9 | `mm9` |
| Rat | mRatBN7.2 / rn7 | `rn7` |
| Rat | rn6 | `rn6` |
| Zebrafish | GRCz11 / danRer11 | `danRer11` |
| Drosophila | dm6 | `dm6` |
| Drosophila | dm3 | `dm3` |
| C. elegans | ce11 | `ce11` |
| S. cerevisiae | sacCer3 | `sacCer3` |
| A. thaliana | TAIR10 / araTha1 | `araTha1` |
| E. coli K-12 MG1655 | eschColi_K12 | `eschColi_K12` |

For organisms not listed, or to verify patches: search the Galaxy UI's "Reference genome" dropdown on any aligner tool, or call `get_tool_details(<aligner tool id>, io_details=True)` and read the `options` list for the `reference_genome` parameter.

---

## Setting dbkey on an existing dataset

If you forgot to set `dbkey` on upload, or uploaded the wrong patch version, you cannot change it via the MCP cleanly. Re-uploading with the correct `dbkey` is the path of least resistance. (The UI's "edit attributes" pane can change it, but no MCP tool exposes that today). Ensure you get it right the first time by strictly following the natural language constraints.