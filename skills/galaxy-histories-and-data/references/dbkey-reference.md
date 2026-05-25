# Galaxy dbkey (Genome Build) Reference

Galaxy uses the UCSC dbkey identifier for reference genome builds. The `dbkey` you set on an upload determines which reference-genome-aware tools (Bowtie2, BWA, htseq-count with a built-in GTF picker, etc.) will accept the dataset as input.

**Always set `dbkey` on uploads of genomic files** (FASTQ, BAM, BED, GTF, VCF). Skipping it is a frequent cause of "the tool can't find my input" errors.

## Common dbkey values

| Organism | Build | dbkey |
|---|---|---|
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

For organisms not listed: search the Galaxy UI's "Reference genome" dropdown on any aligner tool, or call `get_tool_details(<aligner tool id>, io_details=True)` and read the `options` list for the `reference_genome` parameter.

## Setting dbkey on an existing dataset

If you forgot to set `dbkey` on upload, you can't change it via the MCP cleanly. Re-uploading with the correct `dbkey` is the path of least resistance. (The UI's "edit attributes" pane can change it, but no MCP tool exposes that today.)

## Convention used by this plugin

When the user pastes a protocol that names a genome ("hg38", "GRCh38", "human reference"), normalize to the canonical Galaxy dbkey from the table above before any upload or aligner call.
