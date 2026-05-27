---
name: galaxy-results-reporting
description: Wrap up a Galaxy analysis and report results — publish the current history, generate a public share URL, build a concise summary of pipeline outputs (read counts, alignment rate, top-N expressed genes from a count table), and download the key output datasets locally. Use this at the end of any Galaxy pipeline, or when the user says "publish my history", "share this with my collaborator", "give me the top genes", "summarize the results", or "make this public".
disable-model-invocation: true
---

# Galaxy Results Reporting

<when_to_use>
- "Publish this history and give me the link"
- "Share my <project> results with my collaborator"
- "Make this history public"
- "Summarize the pipeline"
- "Download the count table / BAM / VCF / peaks to outputs/"

Not for:
- Running analysis (`galaxy-tool-execution`)
- Navigating history mid-pipeline (`galaxy-histories-and-data`)
</when_to_use>

<instructions>
Ensure all upstream jobs are `ok`, you have the `history_id`, and `bioblend` is installed if publishing.

1. Publishing the history (CONFIRM FIRST)
Do NOT publish unless the user explicitly asks or you confirm first. If authorized, run the `bioblend_publish.py` script via `Bash`. Surface the URL verbatim. If `bioblend` is missing, tell the user to `pip install bioblend` and stop.

```python
# bioblend_publish.py — run via Bash
import os
from bioblend.galaxy import GalaxyInstance

galaxy_url = os.environ.get("GALAXY_URL", "").rstrip("/")
api_key = os.environ.get("GALAXY_API_KEY")

if not galaxy_url or not api_key:
    print("ERROR: GALAXY_URL or GALAXY_API_KEY missing from environment.")
    exit(1)

gi = GalaxyInstance(url=galaxy_url, key=api_key)
hist = gi.histories.update_history(history_id, published=True, importable=True)

slug = hist.get("slug")
if not slug:
    user_and_slug = hist.get("username_and_slug", "")
    slug = user_and_slug.split("/")[-1] if user_and_slug else str(history_id)

user_info = gi.users.get_current_user()
username = user_info.get("username", "unknown")

share_url = f"{galaxy_url}/u/{username}/h/{slug}"
print(share_url)
```

2. Build a summary
Pull metrics via `get_dataset_details(dataset_id, include_preview=True, preview_lines=N)`.
For large tables, download first: `download_dataset(dataset_id=table_id, file_path="outputs/result.tsv")` then process locally.
Always drop trailing summary rows (e.g., `__no_feature`) from `htseq-count` outputs before ranking.
Parse the stats/log dataset emitted by the tool rather than recomputing metrics manually.

3. Download user-facing outputs
Mirror key artifacts to a local `outputs/` directory: `download_dataset(dataset_id=D, file_path="outputs/<descriptive-name>.<ext>")`. Don't download intermediates.

4. Return summary to parent
Format:
History: <name> (private link: https://<host>/histories/view?id=<id>)
[Published: https://<host>/u/<user>/h/<slug>]    <-- only if authorized
Outputs:
- <metric 1>: <value>
- top N: <short table>
Saved locally: outputs/{<files>}

Gotchas:
- The share URL is the user's deliverable. If publishing fails, say so plainly.
- "Published" means public. If the user only wants a link, provide the private link (`/histories/view?id=<id>`).
- The slug is not the history name. Trust the bioblend script.
- The host comes from `GALAXY_URL`, not hardcoded.
</instructions>

<example>
# Close out an alignment-and-quantify pipeline

# 1) Get stats
stats_text = get_dataset_details(dataset_id=stats_id, include_preview=True, preview_lines=20)["preview"]
metric_line = next(l for l in stats_text.splitlines() if "overall alignment rate" in l)

# 2) Get Top-N
table_text = get_dataset_details(dataset_id=table_id, include_preview=True, preview_lines=500)["preview"]
rows = [l.split("\t") for l in table_text.splitlines() if not l.startswith("__")]
top10 = sorted(rows, key=lambda r: float(r[1]), reverse=True)[:10]

# 3) Download output
download_dataset(dataset_id=table_id, file_path="outputs/results.tsv")

# 4) Return summary string
</example>