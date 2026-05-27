# Galaxy dbkey (Genome Build) Reference

Always set `dbkey` on genomic uploads (FASTQ, BAM, BED, GTF, VCF). The `dbkey` determines tool compatibility.

## Core Directive: Dynamic Resolution

**NEVER assume or hardcode standard dbkeys** (e.g., mapping "latest GRCh38" directly to `hg38`). Tool options dictate the available version patches.

### Resolution Protocol

Execute these steps strictly in order:

1. **Preserve Modifiers:** Quote the requested genome exactly (e.g., `"latest assembly of GRCh38"`) in `<protocol-genome>` blocks or delegation prompts. **NEVER** append a normalized dbkey example (e.g., `(b38): hg38`), as downstream execution will falsely treat it as authoritative.
2. **Defer to Tool:** Wait until the consuming tool (aligner, caller, counter) is identified before selecting a genome.
3. **Enumerate Tool Options:** Fetch the tool's specific index options via MCP:
```bash
get_tool_details(tool_id=TOOL, io_details=True)
jq '.. | objects | select(.name=="index") | .options[] | select(.[0] | test("(?i)<build-keyword>"))' <path>

```


4. **Select via UI Label:** Parse the returned UI labels (which contain dates and/or patch numbers) applying these rules:
* **"latest" / "newest":** Select the option with the most recent **date**. If no dates exist, use the highest **patch number**. *(Note: Galaxy labels never literally say "latest")*.
* **"patch pN" / "pN":** Select the exact patch match (e.g., `GRCm38.p6` / `mm10Patch6`).
* **" " / "":** Select exact date match.
* **Bare build (e.g., "mm10"):** Select the base build with no patch suffix or newer dated variant.


5. **Assert:** Emit the `ASSEMBLY ASSERTION` block before executing `run_tool` or `upload_*` with a `dbkey=` argument.

## Dataset Corrections

If a dataset was uploaded without a `dbkey` or with the incorrect patch version, **re-upload the file**. Do not attempt to edit attributes via MCP.

---

## Fallback: Generic dbkeys

Use this table **ONLY** for ad-hoc uploads where ALL of the following are true:

* No consuming tool is known yet.
* The user provided **NO** version modifiers ("latest", "patched", dates).

*If you are running a workflow or protocol, you are never in this fallback state.*

| Organism | Build | Expected UI Label Prefix | Fallback `dbkey` |
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
| E. coli K-12 | eschColi_K12 | `Escherichia coli K-12 MG1655:` | `eschColi_K12` |