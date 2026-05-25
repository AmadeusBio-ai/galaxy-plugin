---
name: galaxy-results-reporting
description: Wrap up a Galaxy analysis and report results — publish the current history, generate a public share URL, build a concise summary of pipeline outputs (read counts, alignment rate, top-N expressed genes from a count table), and download the key output datasets locally. Use this at the end of any Galaxy pipeline, or when the user says "publish my history", "share this with my collaborator", "give me the top genes", "summarize the results", or "make this public".
disable-model-invocation: true
---

# Galaxy Results Reporting

The closing-out skill. After a pipeline finishes, the user usually wants two things: a shareable URL of the history, and a digestible summary of what came out. This skill handles both.

## When to use

- "Publish this history and give me the link"
- "Share my Lab 7.1 results with my collaborator"
- "Make this history public"
- "Summarize the pipeline — read counts in/out, alignment rate, top 10 genes"
- "Download the count table to outputs/"

**Not for**: running the analysis itself (`galaxy-tool-execution`), navigating the history mid-pipeline (`galaxy-histories-and-data`), differential expression or downstream stats (out of scope for this plugin).

## Prerequisites

- All upstream jobs in the history have reached `ok`.
- You know the `history_id` you're publishing.
- For the BioBlend fallback: `bioblend` installed in the active Python environment and `GALAXY_URL` / `GALAXY_API_KEY` in env.

## Workflow

### 1. Publish the history and get a share URL

The galaxy-mcp server **does not currently expose** `share_history` or `publish_history` as native tools. Use the BioBlend fallback below.

```python
# bioblend_publish.py — run via Bash
import os
from bioblend.galaxy import GalaxyInstance

gi = GalaxyInstance(url=os.environ["GALAXY_URL"], key=os.environ["GALAXY_API_KEY"])
hist = gi.histories.update_history(history_id, published=True, importable=True)
slug = hist.get("slug") or hist.get("username_and_slug", "").split("/")[-1]
username = gi.users.get_current_user()["username"]
print(f"https://usegalaxy.org/u/{username}/h/{slug}")
```

Invoke via the `Bash` tool:
```
python -c "$(cat bioblend_publish.py)"
```

Surface the URL to the parent verbatim — that's the artifact the user actually wanted.

### 2. Build a summary

For an RNA-seq pipeline (the canonical case), the summary the user wants is:

- Input read count (raw FASTQ line count / 4)
- Post-trim read count (trimmed FASTQ line count / 4)
- Overall alignment rate (from Bowtie2 mapping stats dataset)
- Top N expressed genes (from htseq-count output)

Pull each piece via `get_dataset_details(dataset_id, include_preview=True, preview_lines=N)`:

```
# Mapping stats — look for the "overall alignment rate" line
stats = get_dataset_details(dataset_id=bowtie_stats_id, include_preview=True, preview_lines=15)

# Count table — sort by count desc, take top N
counts = get_dataset_details(dataset_id=htseq_counts_id, include_preview=True, preview_lines=500)
# Parse the preview text, drop __no_feature / __ambiguous / __too_low_aQual /
# __not_aligned / __alignment_not_unique rows, sort by col 2 desc, take top N.
```

For larger count tables that don't fit in a preview, download first, then process locally:

```
download_dataset(dataset_id=htseq_counts_id, file_path="outputs/counts.tsv")
# Then use Bash with awk/sort/head, or Python with pandas.
```

### 3. Download the user-facing outputs

Mirror the key outputs to a local `outputs/` directory so the user has offline copies:

```
download_dataset(dataset_id=trimmed_fastq_id, file_path="outputs/trimmed.fastq.gz")
download_dataset(dataset_id=bam_id,           file_path="outputs/aligned.bam")
download_dataset(dataset_id=htseq_counts_id,  file_path="outputs/counts.tsv")
```

Don't download everything by default — only the artifacts the user is likely to want offline. Intermediate datasets stay in Galaxy.

### 4. Return a tidy summary to the parent

```
Published: https://usegalaxy.org/u/<user>/h/<slug>
Pipeline outputs (history id: <id>):
- raw reads:        12,481,332
- post-trim reads:  11,902,118  (95.4% retained)
- alignment rate:   89.3%
- top 10 genes by count:
    ENSG00000111640  GAPDH   18,422
    ...
Saved locally: outputs/{trimmed.fastq.gz, aligned.bam, counts.tsv}
```

Keep it short. Detailed previews go in the response only if asked.

## Critical patterns

### The share URL is the user's deliverable
A pipeline that ran perfectly but produced no shareable link is, to the user, a failed run. If publishing fails (bioblend not installed, auth error), say so plainly — don't claim success.

### Drop htseq-count's `__` rows before "top genes"
htseq-count's output ends with summary lines: `__no_feature`, `__ambiguous`, `__too_low_aQual`, `__not_aligned`, `__alignment_not_unique`. They have huge counts and will dominate any naive "top by count". Filter them out before sorting.

### Don't recompute alignment rate by hand
Bowtie2's mapping-stats dataset already contains "X.XX% overall alignment rate" as a line. Parse that line instead of computing it from BAM flagstats — the formats can differ subtly and the user will trust the stats output.

## Gotchas

1. **BioBlend fallback only works if `bioblend` is installed.** If `python -c "import bioblend"` fails, instruct the user to `pip install bioblend` (or `uv pip install bioblend`) and retry. Don't silently skip the publish step.
2. **Don't publish without telling the user.** "Published" means publicly accessible to anyone with the URL. If the user only said "give me a link", check whether they want public sharing or just a private link.
3. **The slug isn't the history name.** Galaxy lowercases and hyphenates the name for the URL slug. Use whatever BioBlend returns in `slug` rather than constructing it yourself.

## Example — close out an RNA-seq pipeline

```
# 1) Publish
share_url = "<run BioBlend snippet via Bash>"

# 2) Mapping stats
stats_text = get_dataset_details(
    dataset_id=bowtie_stats_id, include_preview=True, preview_lines=15
)["preview"]
align_rate_line = next(l for l in stats_text.splitlines() if "overall alignment" in l)
# e.g. "89.34% overall alignment rate"

# 3) Top-10 from counts
counts_text = get_dataset_details(
    dataset_id=htseq_counts_id, include_preview=True, preview_lines=500
)["preview"]
rows = [l.split("\t") for l in counts_text.splitlines() if not l.startswith("__")]
top10 = sorted(rows, key=lambda r: int(r[1]), reverse=True)[:10]

# 4) Mirror outputs
download_dataset(dataset_id=htseq_counts_id, file_path="outputs/counts.tsv")

# 5) Return summary (see template above)
```
