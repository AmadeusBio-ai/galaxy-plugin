---
name: galaxy-results-reporting
description: Wrap up a Galaxy analysis and report results — publish the current history, generate a public share URL, build a concise summary of pipeline outputs (read counts, alignment rate, top-N expressed genes from a count table), and download the key output datasets locally. Use this at the end of any Galaxy pipeline, or when the user says "publish my history", "share this with my collaborator", "give me the top genes", "summarize the results", or "make this public".
disable-model-invocation: true
---

# Galaxy Results Reporting

The closing-out skill. After a pipeline finishes, the user usually wants two things: a shareable URL of the history, and a digestible summary of what came out. This skill handles both.

## When to use

- "Publish this history and give me the link"
- "Share my <project> results with my collaborator"
- "Make this history public"
- "Summarize the pipeline" (read counts, alignment rate, peak counts, variants, top-N rows of any output table — whichever apply)
- "Download the count table / BAM / VCF / peaks to outputs/"

**Not for**: running the analysis itself (`galaxy-tool-execution`), navigating the history mid-pipeline (`galaxy-histories-and-data`), differential expression or downstream stats (out of scope for this plugin).

## Prerequisites

- All upstream jobs in the history have reached `ok`.
- You know the `history_id` you're publishing.
- For the BioBlend fallback: `bioblend` installed in the active Python environment and `GALAXY_URL` / `GALAXY_API_KEY` in env.

## Workflow

### 1. Publishing the history (CONFIRM FIRST)

The galaxy-mcp server **does not currently expose** `share_history` or `publish_history` as native tools. Publishing is a public-surface action; do NOT publish unless the user explicitly asked, or you have confirmed.

When publishing is authorized, the BioBlend fallback is:

```python
# bioblend_publish.py — run via Bash
import os
from bioblend.galaxy import GalaxyInstance

gi = GalaxyInstance(url=os.environ["GALAXY_URL"], key=os.environ["GALAXY_API_KEY"])
hist = gi.histories.update_history(history_id, published=True, importable=True)
slug = hist.get("slug") or hist.get("username_and_slug", "").split("/")[-1]
username = gi.users.get_current_user()["username"]
host = os.environ["GALAXY_URL"].rstrip("/")
print(f"{host}/u/{username}/h/{slug}")
```

Invoke via the `Bash` tool. Surface the URL to the parent verbatim — that's the artifact the user actually wanted. If `bioblend` isn't installed, tell the user the install command (`uv pip install bioblend` or `pip install bioblend`) and stop — do not silently skip the publish step.

Note: the agent's Bash environment may not see `GALAXY_URL` / `GALAXY_API_KEY` (the MCP launcher reads them, the agent's shell does not). If `os.environ["GALAXY_URL"]` is empty in the script, ask the user to either export the two vars in the shell that launched Claude, or to invoke `/galaxy-setup` to debug.

### 2. Build a summary — shape depends on the pipeline

There is no single template — pick metrics the user actually cares about for this analysis. Common shapes:

| Pipeline | Useful metrics |
|---|---|
| Read alignment | input read count, aligned read count, overall alignment rate, top contigs by depth |
| RNA-seq quantification | input reads, post-trim reads, alignment rate, top-N expressed features |
| ChIP-seq / ATAC-seq peak calling | input reads, mapped reads, peak count, top-N peaks by score |
| Variant calling | input reads, mapped reads, total variants, SNV/indel breakdown |
| Assembly | input reads, contig count, N50, total length |
| Generic | input row count, output row count, % retained, head of the output |

Pull each piece via `get_dataset_details(dataset_id, include_preview=True, preview_lines=N)`. For tables larger than a useful preview, download first then process locally:

```
# Mapping stats / log files — look for the metric line
stats = get_dataset_details(dataset_id=stats_id, include_preview=True, preview_lines=20)

# A larger output table — download then process
download_dataset(dataset_id=table_id, file_path="outputs/result.tsv")
# Then use Bash with awk/sort/head, or Python with pandas, to extract top-N or summary rows.
```

When the output is a count table from `htseq-count` or similar, drop the trailing summary rows (lines starting with `__`) before ranking — they have huge counts and dominate any naive sort.

### 3. Download the user-facing outputs

Mirror the key outputs to a local `outputs/` directory so the user has offline copies. Pick the user-facing artifacts only — don't download intermediates:

```
download_dataset(dataset_id=main_output_id, file_path="outputs/<descriptive-name>.<ext>")
```

### 4. Return a tidy summary to the parent

Template — adapt the rows to the pipeline:

```
History: <name> (private link: https://<host>/histories/view?id=<id>)
[Published: https://<host>/u/<user>/h/<slug>]    <-- only if publishing was authorized
Outputs:
- <metric 1>: <value>
- <metric 2>: <value>
- top N: <short table>
Saved locally: outputs/{<files>}
```

Keep it short. Detailed previews go in the response only if asked.

## Critical patterns

### The share URL is the user's deliverable
A pipeline that ran perfectly but produced no shareable link is, to the user, a failed run. If publishing fails (bioblend not installed, auth error), say so plainly — don't claim success.

### Drop htseq-count's `__` rows before "top genes"
htseq-count's output ends with summary lines: `__no_feature`, `__ambiguous`, `__too_low_aQual`, `__not_aligned`, `__alignment_not_unique`. They have huge counts and will dominate any naive "top by count". Filter them out before sorting.

### Don't recompute summary metrics by hand
Aligners and callers usually emit a stats / log dataset with the metric the user wants (overall alignment rate, peak count, called variants, contig N50). Parse that line instead of computing it from the primary output — formats can differ subtly and the user will trust the tool's own stats output.

## Gotchas

1. **BioBlend fallback only works if `bioblend` is installed.** If `python -c "import bioblend"` fails, instruct the user to `pip install bioblend` (or `uv pip install bioblend`) and retry. Don't silently skip the publish step.
2. **Always confirm before publishing.** "Published" / "importable" means anyone with the URL can view (and import) the history. If the user only said "give me a link", they probably want the private link to their own history (`/histories/view?id=<id>`), not a public share. When in doubt, ask.
3. **The slug isn't the history name.** Galaxy lowercases and hyphenates the name for the URL slug. Use whatever BioBlend returns in `slug` rather than constructing it yourself.
4. **The host comes from `GALAXY_URL`, not the hardcoded `usegalaxy.org`.** Some users run private Galaxy instances. Pull the host from the env / from the user's earlier `connect` response.

## Example — close out a generic alignment-and-quantify pipeline

```
# 1) Stats / summary dataset
stats_text = get_dataset_details(
    dataset_id=stats_id, include_preview=True, preview_lines=20
)["preview"]
# Extract the metric line your tool emits — e.g.:
#   "89.34% overall alignment rate" for Bowtie2
#   "Total peaks: 14,221" for MACS3
#   "Number of variants:  4521" for bcftools stats
metric_line = next(l for l in stats_text.splitlines() if "<keyword>" in l)

# 2) Top-N from a tabular output
table_text = get_dataset_details(
    dataset_id=table_id, include_preview=True, preview_lines=500
)["preview"]
rows = [l.split("\t") for l in table_text.splitlines() if not l.startswith("__")]
top10 = sorted(rows, key=lambda r: float(r[1]), reverse=True)[:10]

# 3) Mirror the user-facing output
download_dataset(dataset_id=table_id, file_path="outputs/<descriptive>.tsv")

# 4) Return summary (see template above)
```
