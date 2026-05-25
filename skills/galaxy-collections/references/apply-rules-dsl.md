# Apply Rules DSL — Complete Reference

`__APPLY_RULES__` is Galaxy's swiss-army collection transformer. It can replace most of the dedicated collection-op tools at the cost of more verbose input.

**Mental model**: collection → table of element metadata → apply rules to transform the table → mapping ops define how the final table becomes a new collection structure.

## Input shape

```python
run_tool(history_id=H, tool_id="__APPLY_RULES__", inputs={
    "input": {"src": "hdca", "id": collection_id},
    "rules": {
        "rules":   [ ... list of rule operations, applied in order ... ],
        "mapping": [ ... list of mapping operations defining the output structure ... ],
    },
})
```

The `rules` list runs sequentially; each rule can add columns to or filter rows from the working table. The `mapping` list runs last and turns the final table into a collection.

## Column-addition rules

These add new columns to the working table.

| `type` | Adds | Parameters |
|---|---|---|
| `add_column_metadata` | A metadata field as a column | `value`: `identifier0`, `identifier1`, …, `index0`, `index1`, …, or `tags` |
| `add_column_group_tag_value` | The value of a specific group tag | `value`: tag name (e.g., `"condition"`); `default_value`: fallback for elements missing the tag |
| `add_column_regex` | Regex capture or replace from an existing column | `target_column`: int; `expression`: regex; `replacement`?: string for replace mode; `group_count`?: int for capture mode (number of groups); `allow_unmatched`?: bool |
| `add_column_substr` | Fixed substring from an existing column | `target_column`: int; `substr_type`: `keep_prefix` / `keep_suffix` / `drop_prefix` / `drop_suffix`; `length`: int |
| `add_column_rownum` | Sequential row numbers | `start`: 0 or 1 |
| `add_column_value` | Constant literal | `value`: string |
| `add_column_concatenate` | Join two columns into a new one | `target_column_0`: int; `target_column_1`: int |
| `add_column_basename` | Filename portion of a path | `target_column`: int |
| `add_column_from_sample_sheet_index` | Value from a referenced sample sheet | `value`: column index |

## Filter rules

These remove rows from the working table.

| `type` | Filters by | Parameters |
|---|---|---|
| `add_filter_regex` | Pattern match | `target_column`: int; `expression`: regex; `invert`: bool (`false` keeps matches, `true` removes matches) |
| `add_filter_matches` | Exact value | `target_column`: int; `value`: string; `invert`: bool |
| `add_filter_count` | First/last N rows | `count`: int; `which`: `"first"` or `"last"`; `invert`: bool |
| `add_filter_empty` | Empty cells | `target_column`: int; `invert`: bool |
| `add_filter_compare` | Numeric comparison | `target_column`: int; `value`: number; `compare_type`: `less_than` / `greater_than` / `equal_to` / `not_equal_to` |

## Structural rules

| `type` | Effect | Parameters |
|---|---|---|
| `remove_columns` | Delete columns | `target_columns`: list of indices |
| `sort` | Reorder rows | `target_column`: int; `numeric`: bool |
| `swap_columns` | Swap two columns' positions | `target_column_0`, `target_column_1` |
| `split_columns` | Expand rows (Cartesian) | `target_columns_0`: list; `target_columns_1`: list |

## Mapping operations (final step)

These turn the final table back into a collection. At least one is required.

| `type` | Produces | Parameters |
|---|---|---|
| `list_identifiers` | List structure | `columns`: list of column indices — `[0]` = flat list, `[0, 1]` = list:list, `[0, 1, 2]` = list:list:list |
| `paired_identifier` | Add a paired level | `columns`: single column whose values are `forward`/`reverse` (or `f`/`r`, `1`/`2`, `R1`/`R2`) |
| `paired_or_unpaired_identifier` | Mixed paired/unpaired level | `columns`: single column |
| `tags` | Apply element tags | `columns`: list of tag-value columns |
| `group_tags` | Apply group tags | `columns`: list of columns; each column becomes a `group:colname:value` tag |

## Worked examples

### Filter out `control_` samples (simplest case)

```python
rules = {
    "rules": [
        {"type": "add_column_metadata", "value": "identifier0"},
        {"type": "add_filter_regex", "target_column": 0,
         "expression": "^control_", "invert": True},
    ],
    "mapping": [
        {"type": "list_identifiers", "columns": [0]},
    ],
}
```

### Parse paired-end fastqs into a list:paired

Files like `sample1_R1.fastq.gz`, `sample1_R2.fastq.gz`. Want a list:paired with `sample1`, `sample2`, … each holding a forward+reverse pair.

```python
rules = {
    "rules": [
        {"type": "add_column_metadata", "value": "identifier0"},
        # Capture (sample) and (read_num) from the filename
        {"type": "add_column_regex", "target_column": 0,
         "expression": r"(.+)_R([12])\.fastq\.gz", "group_count": 2},
        # Translate "1"/"2" to "forward"/"reverse"
        {"type": "add_column_regex", "target_column": 2,
         "expression": "1", "replacement": "forward", "allow_unmatched": True},
        {"type": "add_column_regex", "target_column": 2,
         "expression": "2", "replacement": "reverse", "allow_unmatched": True},
        {"type": "sort", "target_column": 1, "numeric": False},
        {"type": "remove_columns", "target_columns": [0, 2, 3]},
    ],
    "mapping": [
        {"type": "list_identifiers",   "columns": [0]},
        {"type": "paired_identifier",  "columns": [1]},
    ],
}
```

After the regex captures, column 1 holds the sample name, column 2 the read-number → `forward`/`reverse`. The mapping then nests by sample and pairs by read direction.

### Group samples by experimental condition (from tags)

Assumes a prior `__TAG_FROM_FILE__` attached `group:condition:treated` etc.

```python
rules = {
    "rules": [
        {"type": "add_column_metadata", "value": "identifier0"},
        {"type": "add_column_group_tag_value", "value": "condition",
         "default_value": "unassigned"},
    ],
    "mapping": [
        # Group by condition first, then by sample — produces list:list
        {"type": "list_identifiers", "columns": [1, 0]},
        # Re-apply condition as a group tag on the inner level
        {"type": "group_tags", "columns": [1]},
    ],
}
```

### Filter and sort in one pass

```python
rules = {
    "rules": [
        {"type": "add_column_metadata", "value": "identifier0"},
        {"type": "add_filter_regex", "target_column": 0,
         "expression": "^control_", "invert": True},
        {"type": "sort", "target_column": 0, "numeric": False},
    ],
    "mapping": [
        {"type": "list_identifiers", "columns": [0]},
    ],
}
```

## When to use Apply Rules vs a dedicated tool

- **Dedicated tool** if there's a 1:1 match (filter by id list → `__FILTER_FROM_FILE__`, sort → `__SORTLIST__`, etc.). Faster to read, easier to debug.
- **Apply Rules** when you need regex on identifiers, tag-based restructuring, multi-step filter-then-restructure, or paired-end pairing from filename patterns.

## Reproducibility note

Apply Rules transformations are fully captured in the Galaxy history and can be extracted to a workflow. The rules dict itself is the documentation of what the transformation does — copy it into the workflow alongside the data.
