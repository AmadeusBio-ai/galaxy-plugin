---
name: galaxy-workflows
description: Find, import, and run Galaxy workflows — search the IWC (Intergalactic Workflow Commission) registry by topic, import an IWC workflow into the user's account, list the user's own workflows, inspect a workflow's step structure, invoke a workflow with mapped inputs, and monitor an invocation. Use this whenever the user says "is there a workflow for X", "import the IWC workflow", "run a workflow", "invocation", or whenever an analysis would require chaining more than ~3 Galaxy tools sequentially.
disable-model-invocation: true
---

# Galaxy Workflows

When an analysis is more than a handful of tools, a workflow is almost always better than chained `run_tool` calls — it's reproducible, sharable, and captured as a single artifact. The IWC (Intergalactic Workflow Commission) is the curated registry of community workflows; check there before composing one by hand.

## When to use

- "Is there an IWC workflow for bulk RNA-seq?"
- "Import the workflow at trs://<id>"
- "Run my Variant Calling workflow on these inputs"
- "Show me the steps of workflow X"
- "What's the status of invocation Y?"
- Heuristic: if you're about to chain more than ~3 `run_tool` calls, stop and check IWC first.

**Not for**: ad-hoc single-tool runs (`galaxy-tool-execution`), authoring new workflows from scratch (use the Galaxy UI — no MCP tool exposes the workflow editor), tool-shed workflow installation.

## Prerequisites

- MCP connected.
- A history to write outputs into.
- Inputs already uploaded as datasets or collections in the target history.

## Workflow

### 1. Find an existing workflow

```
# IWC (curated, public)
search_iwc_workflows(query="rna-seq counts")
get_iwc_workflows()                       # full manifest if you need to browse

# User's own workflows
list_workflows(published=True)            # public on this Galaxy instance
list_workflows()                          # the user's own
list_workflows(name="Variant Calling")    # partial, case-insensitive
```

Prefer IWC over the user's private workflows for reproducibility (IWC workflows are versioned and tested).

### 2. Import an IWC workflow into the user's account

```
import_workflow_from_iwc(trs_id="#workflow/github.com/iwc-workflows/rnaseq-pe/main")
# Returns a workflow_id under the user's account
```

You only need to import once per Galaxy account — subsequent runs reuse the imported workflow.

### 3. Inspect the workflow's input steps

```
details = get_workflow_details(workflow_id=W)
# details["steps"] enumerates each step; input steps have type "data_input" or "data_collection_input"
```

You need the **step index** (a string, "0", "1", …) for every input you'll map. The step index is the key in the `inputs` dict you'll pass to `invoke_workflow`.

### 4. Invoke

```
invoke_workflow(
    workflow_id=W,
    history_id=H,
    inputs={
        "0": {"id": fastq_dataset_id, "src": "hda"},
        "1": {"id": gtf_dataset_id,   "src": "hda"},
    },
    params={
        # Step-level parameter overrides; keyed by step index.
        # Usually you can leave this empty unless you need to override a tool param.
    },
)
# Returns an invocation object with an invocation_id.
```

### 5. Monitor the invocation

```
inv = get_invocations(invocation_id=I)
# inv["state"]: "new" → "scheduled" → "ready" → "scheduled" → "done"
# inv["steps"]: per-step state and job IDs

# For each running step, poll the underlying job via get_job_details on its output datasets.
```

Workflow invocations have their own state machine layered on top of per-step job states — a workflow can be `scheduled` while individual steps are still `queued`. Treat invocation `state: "scheduled"` as "in progress, keep polling".

### 6. Cancel if needed

```
cancel_workflow_invocation(invocation_id=I)
```

## Critical patterns

### `invoke_workflow` inputs use **step indices**, not parameter names

```python
# CORRECT — keys are step indices as strings
inputs = {
    "0": {"id": fastq_id, "src": "hda"},
    "1": {"id": gtf_id,   "src": "hda"},
}

# WRONG — using param names won't work
inputs = {
    "input_fastq": {"id": fastq_id, "src": "hda"},
}
```

Use `get_workflow_details` to map names → step indices before invoking.

### Collection inputs use `src: "hdca"`

Same convention as `run_tool`:

```python
{"2": {"id": collection_id, "src": "hdca"}}
```

### Prefer IWC over composing manually when steps > 3

Manually chained `run_tool` calls are:
- Not reproducible by anyone but you.
- Not extractable to a workflow without rework.
- More likely to have wrong input-shape bugs (each tool call is a fresh chance to get pipe-notation wrong).

A single `invoke_workflow` call against an IWC workflow has none of these issues.

## Gotchas

1. **An invocation that reaches `state: "done"` can still have failed steps.** Always check `inv["steps"]` for any step in `error` state and read its job's `stderr`.
2. **IWC workflow versions matter.** `get_workflow_details(workflow_id, version=N)` lets you pin a version. Default is latest, which can shift under you.
3. **`paused` invocations need user action.** If a step's input criteria can't be met (e.g., upstream step produced nothing), the invocation pauses. Surface this clearly — the workflow won't unstick itself.

## Example — import the IWC RNA-seq workflow and run it

```
# 1) Find
hits = search_iwc_workflows(query="rna-seq")
trs_id = hits[0]["trs_id"]   # e.g. "#workflow/github.com/iwc-workflows/rnaseq-pe-counts/main"

# 2) Import (once per account)
imported = import_workflow_from_iwc(trs_id=trs_id)
workflow_id = imported["id"]

# 3) Inspect to map step indices
details = get_workflow_details(workflow_id=workflow_id)
# Suppose step "0" is the FASTQ collection input and step "1" is the GTF.

# 4) Invoke
inv = invoke_workflow(
    workflow_id=workflow_id,
    history_id=history_id,
    inputs={
        "0": {"id": fastq_collection_id, "src": "hdca"},
        "1": {"id": gtf_dataset_id,      "src": "hda"},
    },
)
invocation_id = inv["id"]

# 5) Poll get_invocations(invocation_id=invocation_id) every 30s until state == "done".
#    Then check each step for "error" state and surface any failures.
```
