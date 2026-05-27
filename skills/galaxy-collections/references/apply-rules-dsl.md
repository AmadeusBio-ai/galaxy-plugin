# Apply Rules DSL

<instructions>
Input Shape:
`run_tool(history_id=H, tool_id="__APPLY_RULES__", inputs={"input": {"src": "hdca", "id": collection_id}, "rules": {"rules": [ ... ], "mapping": [ ... ]}})`

Column-Addition Rules:
- `add_column_metadata`: `value`: `identifier0`... or `tags`
- `add_column_group_tag_value`: `value`: tag name; `default_value`: string
- `add_column_regex`: `target_column`: int; `expression`: regex; `replacement`: string; `group_count`: int; `allow_unmatched`: bool
- `add_column_substr`: `target_column`: int; `substr_type`: `keep_prefix`/`keep_suffix`/`drop_prefix`/`drop_suffix`; `length`: int
- `add_column_rownum`: `start`: 0 or 1
- `add_column_value`: `value`: string
- `add_column_concatenate`: `target_column_0`: int; `target_column_1`: int
- `add_column_basename`: `target_column`: int
- `add_column_from_sample_sheet_index`: `value`: column index

Filter Rules (remove rows):
- `add_filter_regex`: `target_column`: int; `expression`: regex; `invert`: bool
- `add_filter_matches`: `target_column`: int; `value`: string; `invert`: bool
- `add_filter_count`: `count`: int; `which`: `"first"`/`"last"`; `invert`: bool
- `add_filter_empty`: `target_column`: int; `invert`: bool
- `add_filter_compare`: `target_column`: int; `value`: number; `compare_type`: `less_than`/`greater_than`/`equal_to`/`not_equal_to`

Structural Rules:
- `remove_columns`: `target_columns`: list
- `sort`: `target_column`: int; `numeric`: bool
- `swap_columns`: `target_column_0`, `target_column_1`
- `split_columns`: `target_columns_0`: list; `target_columns_1`: list

Mapping Operations (turn final table into collection):
- `list_identifiers`: `columns`: list (e.g. `[0]` flat, `[0,1]` list:list)
- `paired_identifier`: `columns`: single column (`forward`/`reverse`)
- `paired_or_unpaired_identifier`: `columns`: single column
- `tags`: `columns`: list
- `group_tags`: `columns`: list

When to Use:
- Use dedicated tools for 1:1 matches (`__FILTER_FROM_FILE__`, `__SORTLIST__`).
- Use `__APPLY_RULES__` for regex parsing, conditional restructuring, tag-based grouping.
</instructions>

<example>
### Filter out `control_` samples
```python
rules = {
    "rules": [
        {"type": "add_column_metadata", "value": "identifier0"},
        {"type": "add_filter_regex", "target_column": 0, "expression": "^control_", "invert": True},
    ],
    "mapping": [
        {"type": "list_identifiers", "columns": [0]},
    ],
}
```

### Parse paired-end fastqs into a list:paired
```python
rules = {
    "rules": [
        {"type": "add_column_metadata", "value": "identifier0"},
        {"type": "add_column_regex", "target_column": 0, "expression": r"(.+)_R([12])\.fastq\.gz", "group_count": 2},
        {"type": "add_column_regex", "target_column": 2, "expression": "1", "replacement": "forward", "allow_unmatched": True},
        {"type": "add_column_regex", "target_column": 2, "expression": "2", "replacement": "reverse", "allow_unmatched": True},
        {"type": "sort", "target_column": 1, "numeric": False},
        {"type": "remove_columns", "target_columns": [0, 2, 3]},
    ],
    "mapping": [
        {"type": "list_identifiers",   "columns": [0]},
        {"type": "paired_identifier",  "columns": [1]},
    ],
}
```
</example>
