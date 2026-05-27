# Galaxy Collection-Op Tool Catalog

<instructions>
Filter Tools:
- `__FILTER_FROM_FILE__`: `{"input": {"values": [{"src": "hdca", "id": C}]}, "how|how_filter": "remove_if_absent", "how|filter_source": {"values": [{"src": "hda", "id": F}]}}`
- `__FILTER_EMPTY_DATASETS__`: `{"input": {"src": "hdca", "id": C}}`
- `__FILTER_FAILED_DATASETS__`: `{"input": {"src": "hdca", "id": C}}`
- `__FILTER_NULL__`: `{"input": {"src": "hdca", "id": C}}`
- `__KEEP_SUCCESS_DATASETS__`: `{"input": {"src": "hdca", "id": C}}`

Restructure Tools:
- `__FLATTEN__`: `{"input": {"src": "hdca", "id": C}, "join_identifier": "_"}`
- `__NEST__`: `{"input": {"src": "hdca", "id": C}}`
- `__ZIP_COLLECTION__`: `{"input_forward": {"src": "hdca", "id": C1}, "input_reverse": {"src": "hdca", "id": C2}}`
- `__UNZIP_COLLECTION__`: `{"input": {"src": "hdca", "id": C}}`
- `__SPLIT_PAIRED_AND_UNPAIRED__`: `{"input": {"src": "hdca", "id": C}}`
- `__MERGE_COLLECTION__`: `{"inputs_0|input": {"src": "hdca", "id": C1}, "inputs_1|input": {"src": "hdca", "id": C2}}`
- `__HARMONIZELISTS__`: `{"input_a": {"src": "hdca", "id": C1}, "input_b": {"src": "hdca", "id": C2}}`

Relabel / Tag / Sort:
- `__RELABEL_FROM_FILE__`: `{"input": {"src": "hdca", "id": C}, "how|how_select": "tabular", "how|labels": {"src": "hda", "id": F}, "how|strict": False}`
- `__TAG_FROM_FILE__`: `{"input": {"values": [{"src": "hdca", "id": C}]}, "tags": {"values": [{"src": "hda", "id": F}]}, "how": "add"}`
- `__SORTLIST__`: `{"input": {"src": "hdca", "id": C}, "sort_type|sort_type": "alpha"}`

Extract / Build:
- `__EXTRACT_DATASET__`: `{"input": {"src": "hdca", "id": C}, "which|which": "first"}`
- `__BUILD_LIST__`: `{"datasets_0|input": {"src": "hda", "id": D1}, "datasets_0|id_cond|id_select": "manual", "datasets_0|id_cond|identifier": "sample1"}`
- `__DUPLICATE_FILE_TO_COLLECTION__`: `{"input": {"src": "hda", "id": D}, "size": 5}`

Cross-Product:
- `__CROSS_PRODUCT_FLAT__` / `__CROSS_PRODUCT_NESTED__`: `{"input_a": {"src": "hdca", "id": C1}, "input_b": {"src": "hdca", "id": C2}}`

When none of these fit, use `__APPLY_RULES__`.
</instructions>
