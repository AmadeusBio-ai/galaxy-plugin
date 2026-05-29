---
name: galaxy-histories-and-data
description: Galaxy histories and dataset I/O via the galaxy-mcp server — create a new history, switch histories, list histories, upload a local file or from a URL, preview a dataset, download a dataset to disk, look up a dataset by its UI hid number, page through a large history's contents, and set the correct dbkey and file_type on upload. Use this whenever the user mentions histories, uploading, fastq, fasta, BAM, BED, GTF, "show me", "preview", "download my", or working with a specific dataset.
disable-model-invocation: true
---

# Galaxy Histories and Data

<when_to_use>
- "Create a new history named X"
- "Upload this FASTQ" / "upload `annotations.gtf` from this URL with dbkey mm10"
- "Show me the first 10 lines of dataset 42"
- "Download the BAM to outputs/"
- "Switch to my <project> history"
- "Page through my big history"

Not for:
- Running tools (use `galaxy-tool-execution`)
- Collection-specific ops (use `galaxy-collections`)
- Publishing or sharing the history (use `galaxy-results-reporting`)
</when_to_use>

<instructions>
Ensure MCP is connected and a history is available. Create one if needed.
Convention: Use one history per task, named with date and descriptive title.

1. Pick or create a history
`list_history_ids()`
`get_histories(name="ChIP-seq Apr", limit=20)`
`create_history(history_name="<analysis> — 2026-05-25")`

2. Upload data
Local file: `upload_file(path="/path/to/sample.fastq.gz", history_id=H)`
From URL: `upload_file_from_url(url="...", history_id=H, file_type="gtf", dbkey="dm6")`
Always pass `file_type` and `dbkey` for genomic files.

**dbkey on upload — honor the protocol's version constraint.**
If the protocol names a plain build (e.g. "dm6", "human reference") with no version modifier, use the generic value from `references/dbkey-reference.md`. If it carries any constraint ("latest", "newest", a patch like `p14`, a date, or a partial UI-label prefix), do **not** normalize to the base build — resolve it against Galaxy's live option list on the consuming tool (`get_tool_details(io_details=True)` + `jq`, see `../galaxy-tool-execution/references/efficient-discovery.md`) and use that value as the `dbkey`. Quote the constraint verbatim; never silently reduce "latest GRCh38" to `hg38`.

Wait for the upload job to reach `ok` before using the dataset in tools.

3. Find a dataset
By UI number (`hid`): Use `get_history_contents(history_id=H, order="hid-dsc", limit=50)`, filter by `hid`, and use the `id`.
To include hidden/deleted: `get_history_contents(history_id=H, deleted=True, visible=False, limit=200)`.
For large histories, paginate with `limit` and `offset`.

4. Preview a dataset
For polling status: `get_dataset_details(dataset_id=D, include_preview=False)`
For reading contents: `get_dataset_details(dataset_id=D, include_preview=True, preview_lines=15)`
Always preview after a tool runs (`state: ok` doesn't mean correctness), but use `include_preview=False` in wait loops to avoid dumping large headers.

5. Download to disk
`download_dataset(dataset_id=D, file_path="outputs/result.tsv")`
Omit `file_path` to load into memory instead.

Critical Patterns:
- Pass `dbkey` and `file_type` on every upload to avoid silent downstream failures. When the protocol carries a version constraint, resolve the `dbkey` against Galaxy's live option list (see the dbkey note above). `references/dbkey-reference.md`'s fallback table is **only** for uploads with no version modifier.
- Use `id` (hex hash) for MCP calls, not `hid` (UI number). Look up `hid` first if provided by user.
</instructions>

<example>
# Create history, upload URL ref and local data, preview
h = create_history(history_name="<analysis> — 2026-05-25")
history_id = h["id"]

ref = upload_file_from_url(
    url="https://example.org/annotations.gtf",
    history_id=history_id,
    file_type="gtf",
    dbkey="mm10",
)
ref_id = ref["outputs"][0]["id"]

reads = upload_file(
    path="/path/to/sample.fastq.gz",
    history_id=history_id,
)
reads_id = reads["outputs"][0]["id"]

# Poll both to ok
# get_dataset_details(dataset_id=ref_id, include_preview=False)

# Sanity check content
get_dataset_details(dataset_id=ref_id,   include_preview=True, preview_lines=5)
get_dataset_details(dataset_id=reads_id, include_preview=True, preview_lines=4)
</example>

## References
- `references/dbkey-reference.md` — dynamic dbkey resolution rules and the generic fallback table (the latter only for uploads with no version modifier).
- `references/dataset-retrieval.md` — pagination patterns, hidden/deleted toggles.
