# Galaxy `run_tool` Input Dict Patterns

<instructions>
Source Kinds:
- `hda`: HistoryDatasetAssociation (a single dataset in a history). Get `id` from `get_history_contents`.
- `hdca`: HistoryDatasetCollectionAssociation (a dataset collection). Get `id` from `get_history_contents`.
- `ldda`: LibraryDatasetDatasetAssociation (rarely used from MCP).

Input Formats:
- Simple dataset input: `{"input": {"src": "hda", "id": dataset_id}}`
- Simple collection input: `{"input": {"src": "hdca", "id": collection_id}}` (Does NOT work for filter/tag/relabel ops).
- Collection input with `values` wrapper: `{"input": {"values": [{"src": "hdca", "id": collection_id}]}}` (Required for collection-op tools).

Conditional Parameters (Pipe Notation):
- Use pipe notation arbitrarily deep: `"a|b|c|d": value`.
- NEVER nest these as sub-objects.
- Example: `{"how|how_filter": "remove_if_absent", "how|filter_source": {"src": "hda", "id": file_id}}`

Repeats (Indexed Prefix):
- Use `0|...`, `1|...` prefixes. Index starts at 0. Skipping an index breaks the tool.
- Example: `{"operations_0|operation|name": "SLIDINGWINDOW", "operations_1|operation|name": "LEADING"}`

Map-Over a Collection:
- Run a per-dataset tool on every element using `batch: True`. Returns `implicit_collections[]`.
- Linked map-over (default): `{"forward": {"batch": True, "linked": True, "values": [{"src": "hdca", "id": fwd_id}]}}`
- Unlinked map-over: `{"a": {"batch": True, "linked": False, "values": [{"src": "hdca", "id": a_id}]}}`
- Nested collection: `{"input": {"batch": True, "values": [{"src": "hdca", "map_over_type": "paired", "id": list_paired_id}]}}`

Multiple Datasets to a Single Parameter:
- List of dictionaries without indexed prefixes.
- Example: `{"inputs": [{"src": "hda", "id": d1_id}, {"src": "hda", "id": d2_id}]}`

Response Shape from `run_tool`:
- `outputs`: individual datasets created.
- `output_collections`: explicitly created collections.
- `implicit_collections`: collections created by map-over.
- `jobs`: job IDs to poll.

When in doubt:
- Call `get_tool_run_examples(tool_id)` and copy the exact shape.
</instructions>
