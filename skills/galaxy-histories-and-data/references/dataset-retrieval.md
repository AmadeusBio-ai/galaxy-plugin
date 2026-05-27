# Dataset Retrieval

<instructions>
Order Options:
`order=` controls sort of `get_history_contents`:
- `hid-asc`: Oldest first (default)
- `hid-dsc`: Newest first (use for "latest output")
- `create_time-dsc`: Most recently created
- `update_time-dsc`: Most recently modified
- `name-asc`: Alphabetical by name

Pagination:
- Iterate using `offset` and `limit`.
- Do NOT request the whole history in one call.
`get_history_contents(history_id=H, limit=100, offset=0)`

Showing Hidden/Deleted Datasets:
- `deleted=True`: includes soft-deleted.
- `visible=False`: includes hidden datasets.

Find Dataset by UI hid:
- Fetch recent items and match `hid`.
`match = next(x for x in items if x["hid"] == 42)`

Find History by URL Slug:
- Extract actual name from slug (e.g., `usegalaxy.org/u/<user>/h/<slug>`).
`target_name = slug.replace("-", " ").lower()`
`match = next(h for h in histories if h["name"].lower() == target_name)`

Preview vs Download:
- `get_dataset_details(dataset_id, include_preview=True, preview_lines=15)`: In-memory preview.
- `download_dataset(dataset_id, file_path="...")`: Save to disk.
- `download_dataset(dataset_id)`: Return content in memory (small files only).

Inspecting Job:
- `get_job_details(dataset_id=D)` returns `state`, `stderr`, `stdout`, `output_collections`. Read `stderr` for errors.
</instructions>
