# Dataset Retrieval — Pagination, Ordering, Lookup

Deeper reference for non-trivial history navigation. Read this when the default `get_history_contents(history_id, limit=100)` isn't enough — large histories, hidden datasets, lookup-by-UI-number, lookup-by-URL.

## Order options

`order=` controls the sort of `get_history_contents`:

| Value | Meaning |
|---|---|
| `hid-asc` | Oldest first (Galaxy's default) |
| `hid-dsc` | Newest first — usually what you want when looking for "the latest output" |
| `create_time-dsc` | Most recently created (close to `hid-dsc`, but uses timestamps) |
| `update_time-dsc` | Most recently modified — useful when a dataset was just refreshed |
| `name-asc` | Alphabetical by name |

## Pagination

```python
get_history_contents(history_id=H, limit=100, offset=0)   # page 1
get_history_contents(history_id=H, limit=100, offset=100) # page 2
# … iterate until result count < limit
```

Don't request the whole history in one call — large histories (1k+ datasets) make the response slow and the context noisy.

## Showing hidden / deleted datasets

```python
get_history_contents(
    history_id=H,
    deleted=True,
    visible=False,
    limit=200,
)
```

`deleted=True` includes datasets the user has soft-deleted. `visible=False` shows datasets marked as hidden (workflow intermediates often are). If a count seems too low, toggle both.

## Find dataset by UI hid

`hid` is the small integer in the Galaxy UI (e.g., `42`). It's not a valid API identifier. To resolve:

```python
items = get_history_contents(history_id=H, order="hid-dsc", limit=200)
match = next(x for x in items if x["hid"] == 42)
dataset_id = match["id"]   # the hex hash you need
```

## Find history by URL slug

Galaxy share URLs look like `usegalaxy.org/u/<user>/h/<slug>`. Slugs are lowercase-hyphenated; the history's actual name is title-cased and contains spaces. `get_histories(name=...)` filters case-sensitively on the actual name and won't match the slug.

To resolve a URL slug:

```python
slug = "lab-7-1-2026-05-25"
target_name = slug.replace("-", " ").lower()
histories = list_history_ids()
match = next(h for h in histories if h["name"].lower() == target_name)
```

## Preview vs download

- `get_dataset_details(dataset_id, include_preview=True, preview_lines=15)` — pulls the first N lines into the response. Use for sanity checks, alignment-stats reading, count-table previews.
- `download_dataset(dataset_id, file_path="...")` — saves to disk. Use when the user wants the file locally, or when downstream tools (outside Galaxy) need it.
- `download_dataset(dataset_id)` (no `file_path`) — returns content in memory. Only use for small files.

## Inspecting a dataset's job

```python
get_job_details(dataset_id=D)
```

Returns the job that produced this dataset, including `state`, `stderr`, `stdout`, and (with `?full=true` semantics) `output_collections`. This is the right call for "what went wrong" — `stderr` usually contains the tool's actual complaint.
