# Galaxy Collection-Op Tool Catalog

Full table of Galaxy's built-in collection-operation tools with the exact input dict shape for each. The SKILL.md lists the most common picks; come here for the complete set and for tools you haven't used before.

All shapes assume `run_tool(history_id=H, tool_id=..., inputs=...)`. Most filter/tag/relabel tools require the `values` wrapper around dataset/collection refs (`{"values": [{"src": ..., "id": ...}]}`); when the wrapper is mandatory, the example below shows it.

## Filter tools

### `__FILTER_FROM_FILE__` — keep/remove elements by identifier list

```python
{
    "input": {"values": [{"src": "hdca", "id": collection_id}]},
    "how|how_filter": "remove_if_absent",   # or "remove_if_present"
    "how|filter_source": {"values": [{"src": "hda", "id": id_list_file_id}]},
}
```

The `id_list_file` is a one-identifier-per-line text file.

### `__FILTER_EMPTY_DATASETS__` — drop zero-byte elements

```python
{"input": {"src": "hdca", "id": collection_id}}
```

### `__FILTER_FAILED_DATASETS__` — drop elements whose job errored

```python
{"input": {"src": "hdca", "id": collection_id}}
```

Useful after a map-over `run_tool` where some per-element jobs failed.

### `__FILTER_NULL__` — drop elements whose value is null (conditional outputs)

```python
{"input": {"src": "hdca", "id": collection_id}}
```

### `__KEEP_SUCCESS_DATASETS__` — inverse of FILTER_FAILED

```python
{"input": {"src": "hdca", "id": collection_id}}
```

## Restructure tools

### `__FLATTEN__` — collapse nested → flat

```python
{
    "input": {"src": "hdca", "id": nested_collection_id},
    "join_identifier": "_",   # how to combine outer + inner identifiers
}
```

### `__NEST__` — add a nesting level

```python
{
    "input": {"src": "hdca", "id": flat_collection_id},
    # Plus rules for grouping; see Apply Rules for complex cases.
}
```

### `__ZIP_COLLECTION__` — pair two flat lists

```python
{
    "input_forward": {"src": "hdca", "id": r1_list_id},
    "input_reverse": {"src": "hdca", "id": r2_list_id},
}
```

Output is a paired collection.

### `__UNZIP_COLLECTION__` — split paired → two flat lists

```python
{"input": {"src": "hdca", "id": paired_collection_id}}
```

### `__SPLIT_PAIRED_AND_UNPAIRED__` — separate mixed collection

```python
{"input": {"src": "hdca", "id": mixed_collection_id}}
```

### `__MERGE_COLLECTION__` — concatenate multiple collections

```python
{
    "inputs_0|input": {"src": "hdca", "id": c1_id},
    "inputs_1|input": {"src": "hdca", "id": c2_id},
    "inputs_2|input": {"src": "hdca", "id": c3_id},
}
```

### `__HARMONIZELISTS__` — align two collections to same elements + order

```python
{
    "input_a": {"src": "hdca", "id": collection_a_id},
    "input_b": {"src": "hdca", "id": collection_b_id},
}
```

## Relabel / tag / sort

### `__RELABEL_FROM_FILE__` — rename via mapping file

```python
{
    "input": {"src": "hdca", "id": collection_id},
    "how|how_select": "tabular",
    "how|labels": {"src": "hda", "id": mapping_file_id},
    "how|strict": False,
}
```

Mapping file is tabular: old\tnew per line.

### `__TAG_FROM_FILE__` — apply tags via mapping file

```python
{
    "input": {"values": [{"src": "hdca", "id": collection_id}]},
    "tags": {"values": [{"src": "hda", "id": tag_file_id}]},
    "how": "add",   # or "remove"
}
```

Tag file is tabular: identifier\ttag (use `group:condition:treated` for group tags).

### `__SORTLIST__` — reorder elements

```python
{
    "input": {"src": "hdca", "id": collection_id},
    "sort_type|sort_type": "alpha",   # or "numeric" or "file"
}
```

For `sort_type=file`, provide `sort_type|sort_file: {"src": "hda", "id": ...}` with the desired order.

## Extract / build

### `__EXTRACT_DATASET__` — pull one element out

```python
{
    "input": {"src": "hdca", "id": collection_id},
    "which|which": "first",   # or "by_identifier" or "by_index"
    # If by_identifier: "which|identifier": "sample1"
    # If by_index:      "which|index": 0
}
```

### `__BUILD_LIST__` — make a collection from datasets

```python
{
    "datasets_0|input": {"src": "hda", "id": d1_id},
    "datasets_1|input": {"src": "hda", "id": d2_id},
    "datasets_2|input": {"src": "hda", "id": d3_id},
    "datasets_0|id_cond|id_select": "manual",
    "datasets_0|id_cond|identifier": "sample1",
    # ... per-element identifiers
}
```

### `__DUPLICATE_FILE_TO_COLLECTION__` — replicate one dataset N times

```python
{
    "input": {"src": "hda", "id": dataset_id},
    "size": 5,
}
```

## Cross-product

### `__CROSS_PRODUCT_FLAT__` / `__CROSS_PRODUCT_NESTED__` — all-vs-all

```python
{
    "input_a": {"src": "hdca", "id": a_id},
    "input_b": {"src": "hdca", "id": b_id},
}
```

`_FLAT_` gives a flat list of pairs; `_NESTED_` gives a list:list.

## When none of these fit

Use `__APPLY_RULES__` — see `apply-rules-dsl.md`. It can replace all of the above plus do regex parsing, conditional restructuring, and tag-based grouping in one tool call.
