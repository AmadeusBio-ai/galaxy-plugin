---
name: galaxy-histories-and-data
description: Galaxy histories and dataset I/O via the galaxy-mcp server — create a new history, switch histories, list histories, upload a local file or from a URL, preview a dataset, download a dataset to disk, look up a dataset by its UI hid number, page through a large history's contents, and set the correct dbkey (hg38, mm10, etc.) and file_type on upload. Use this whenever the user mentions histories, uploading, fastq, fasta, BAM, BED, GTF, "show me", "preview", "download my", or working with a specific dataset.
disable-model-invocation: true
---

# Galaxy Histories and Data

Owns everything about histories and the dataset I/O around them. If the user says "upload", "create a history", "switch to", "preview", "download", or names a file format, you handle it.

## When to use

- "Create a new history named X"
- "Upload this FASTQ" / "upload `genes.gtf` from this URL with dbkey hg38"
- "Show me the first 10 lines of dataset 42"
- "Download the BAM to outputs/"
- "Switch to my Lab 7.1 history"
- "Page through my big history"

**Not for**:
- Running tools — use `galaxy-tool-execution`.
- Collection-specific ops (filter, relabel, paired-end pairing) — use `galaxy-collections`.
- Publishing or sharing the history at the end of a run — use `galaxy-results-reporting`.

## Prerequisites

- MCP connected (run `/galaxy-setup` if not).
- A history to write into. If none exists for this task, create one as the first step.

## Workflow

### Pick or create a history
```
list_history_ids()                                # quick {id, name} list
get_histories(name="Lab 7.1", limit=20)           # partial, case-sensitive
create_history(history_name="Lab 7.1 — 2026-05-25")
```

Convention: one history per task, named with date or descriptive title — never reuse for clarity.

### Upload data
```
# Local file
upload_file(path="C:/path/to/SRR17484561.fastq.gz", history_id=H)

# From URL — ALWAYS pass file_type and dbkey for genomic files
upload_file_from_url(
    url="https://.../genes.gtf",
    history_id=H,
    file_type="gtf",
    dbkey="hg38",
)
```

Wait for the upload's job to reach `ok` (poll `get_job_details(dataset_id)`) before passing the new dataset into another tool — downstream tools refuse `queued`/`running` inputs.

### Find a dataset
- By UI number (`hid`): `get_history_contents(history_id=H, order="hid-dsc", limit=50)` then filter the result for the `hid` you want; use the returned `id` for further calls.
- Most recent first: `order="hid-dsc"`.
- Pagination on big histories: `limit=100, offset=0`, then `offset=100`, …

### Preview a dataset
```
get_dataset_details(dataset_id=D, include_preview=True, preview_lines=15)
```
Use this to read alignment-stats files, sanity-check count tables, or confirm a tool produced what you expected. **Always preview after a non-trivial tool run** — `state: ok` is not evidence of correctness.

### Download to disk
```
download_dataset(dataset_id=D, file_path="C:/Users/lyang/Code/Galaxy_DEMO/outputs/counts.tsv")
```
Omit `file_path` to get the content into memory instead.

## Critical patterns

### Pass `dbkey` and `file_type` on every upload
Skipping these is the second-most-common silent-failure cause (after pipe-notation). Bowtie2 and htseq-count both filter their input pickers by dbkey; an uploaded GTF without `dbkey=hg38` will simply not appear in their input dropdown via `run_tool`.

See `references/dbkey-reference.md` for common dbkey values.

### `id` (hex hash) vs `hid` (UI number)
Every MCP call uses `id`. If the user gives you "dataset 13", that's an `hid` — look it up first.

### Default `get_history_contents` hides hidden/deleted datasets
If a history looks empty but the UI shows datasets:
```
get_history_contents(history_id=H, deleted=True, visible=False, limit=200)
```

## Example

Create a history, upload a reference GTF from a course URL with the right dbkey, upload a local FASTQ, and preview the first lines of each.

```
# 1) Make the history
h = create_history(history_name="Lab 7.1 — 2026-05-25")
history_id = h["id"]

# 2) Upload the GTF from the course URL — set file_type and dbkey
gtf = upload_file_from_url(
    url="https://bioboot.github.io/bimm143_S24/class-material/genes.gtf",
    history_id=history_id,
    file_type="gtf",
    dbkey="hg38",
)
gtf_id = gtf["outputs"][0]["id"]

# 3) Upload the local FASTQ
fastq = upload_file(
    path="C:/Users/lyang/Code/Galaxy_DEMO/SRR17484561.fastq.gz",
    history_id=history_id,
)
fastq_id = fastq["outputs"][0]["id"]

# 4) Poll both uploads to ok (galaxy-tool-execution has the polling pattern)
#    ...wait for state == "ok" on each...

# 5) Sanity check
get_dataset_details(dataset_id=gtf_id, include_preview=True, preview_lines=5)
get_dataset_details(dataset_id=fastq_id, include_preview=True, preview_lines=4)
```

## References

- `references/dbkey-reference.md` — common dbkey values (hg38, hg19, mm10, dm6, sacCer3, etc.).
- `references/dataset-retrieval.md` — pagination patterns, order options, hid-by-URL slug lookup, hidden/deleted toggles.
