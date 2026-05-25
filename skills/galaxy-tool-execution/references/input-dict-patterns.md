# Galaxy `run_tool` Input Dict Patterns

Exhaustive reference for the shapes the `inputs` dict can take. The SKILL.md covers the most common cases; come here when those don't fit.

## Source kinds

| `src` value | What it refers to | Where you get the id |
|---|---|---|
| `hda` | HistoryDatasetAssociation — a single dataset in a history | `get_history_contents` → `id` |
| `hdca` | HistoryDatasetCollectionAssociation — a dataset collection in a history | `get_history_contents` → collection's `id` |
| `ldda` | LibraryDatasetDatasetAssociation — a dataset in a Galaxy Data Library | Library API (rarely used from MCP) |

## 1. Simple dataset input

```python
{"input": {"src": "hda", "id": dataset_id}}
```

## 2. Simple collection input

```python
{"input": {"src": "hdca", "id": collection_id}}
```

Works for most analysis tools. **Does not work for** `__FILTER_FROM_FILE__`, `__TAG_FROM_FILE__`, `__RELABEL_FROM_FILE__`, and several other collection ops — they require the `values` wrapper (next pattern).

## 3. Collection input with `values` wrapper (required for many collection-op tools)

```python
{
    "input": {
        "values": [{"src": "hdca", "id": collection_id}],
    }
}
```

When in doubt for a collection-op tool, add the wrapper. The MCP will accept the wrapped form even when it isn't strictly required.

## 4. Conditional parameters — pipe notation

Galaxy XML `<conditional name="how">` with child `<param name="how_filter">` and `<param name="filter_source">` becomes:

```python
{
    "how|how_filter": "remove_if_absent",
    "how|filter_source": {"src": "hda", "id": file_id},
}
```

Pipe-notation chains arbitrarily deep: `"a|b|c|d": value`. **Never** nest these as sub-objects — they are silently ignored.

## 5. Repeats — indexed prefix

Galaxy XML `<repeat name="operations">` becomes `operations_0|...`, `operations_1|...`, etc.:

```python
{
    "operations_0|operation|name": "SLIDINGWINDOW",
    "operations_0|operation|window_size": 4,
    "operations_1|operation|name": "LEADING",
    "operations_1|operation|leading": 3,
}
```

Index starts at 0. Skipping an index breaks the tool.

## 6. Map-over a collection (run a per-dataset tool on every element)

```python
{
    "input": {
        "batch": True,
        "values": [{"src": "hdca", "id": collection_id}],
    }
}
```

Returns `implicit_collections[]` in the response, not `outputs[]`.

### Linked map-over (default) — process corresponding elements across multiple collections

```python
{
    "forward": {"batch": True, "linked": True, "values": [{"src": "hdca", "id": fwd_id}]},
    "reverse": {"batch": True, "linked": True, "values": [{"src": "hdca", "id": rev_id}]},
}
```

### Unlinked map-over — Cartesian product

```python
{
    "a": {"batch": True, "linked": False, "values": [{"src": "hdca", "id": a_id}]},
    "b": {"batch": True, "linked": False, "values": [{"src": "hdca", "id": b_id}]},
}
```

### Nested collection — map over a specific inner level

```python
{
    "input": {
        "batch": True,
        "values": [{
            "src": "hdca",
            "map_over_type": "paired",   # operate at the paired level inside a list:paired
            "id": list_paired_collection_id,
        }],
    }
}
```

## 7. Multiple datasets to a single parameter (a `data` param accepting a list)

Some tools accept a multi-dataset parameter (`<param name="inputs" type="data" multiple="true">`):

```python
{
    "inputs": [
        {"src": "hda", "id": d1_id},
        {"src": "hda", "id": d2_id},
        {"src": "hda", "id": d3_id},
    ]
}
```

Different from a repeat — no indexed prefix, just a list.

## Response shape from `run_tool`

```python
{
    "outputs": [...],               # individual datasets created
    "output_collections": [...],    # explicitly created collections (e.g. by __BUILD_LIST__)
    "implicit_collections": [...],  # collections created by map-over
    "jobs": [...],                  # job IDs to poll
}
```

- Use `outputs` for single-dataset tools.
- Use `output_collections` for collection-creation tools.
- Use `implicit_collections` when you used `batch: True` (map-over).

## When in doubt

Call `get_tool_run_examples(tool_id)` and copy a working example's exact shape. Guessing pipe-notation from the tool's XML name is unreliable — names sometimes contain underscores that look like pipe-notation separators but aren't.
