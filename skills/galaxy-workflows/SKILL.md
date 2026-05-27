---
name: galaxy-workflows
description: Find, import, and run Galaxy workflows — search the IWC (Intergalactic Workflow Commission) registry by topic, import an IWC workflow into the user's account, list the user's own workflows, inspect a workflow's step structure, invoke a workflow with mapped inputs, and monitor an invocation. Use this whenever the user says "is there a workflow for X", "import the IWC workflow", "run a workflow", "invocation", or whenever an analysis would require chaining more than 2 Galaxy tools sequentially.
disable-model-invocation: true
---

# Galaxy Workflows

<when_to_use>
- "Is there an IWC workflow for bulk RNA-seq?"
- "Import the workflow at trs://<id>"
- "Run my Variant Calling workflow on these inputs"
- "Show me the steps of workflow X"
- "What's the status of invocation Y?"
- Heuristic: If chaining >2 `run_tool` calls, stop and check IWC first.

Not for:
- Ad-hoc single-tool runs (use `galaxy-tool-execution`)
- Authoring new workflows from scratch (requires Galaxy UI)
- Tool-shed workflow installation
</when_to_use>

<instructions>
Ensure MCP is connected, a history exists, and inputs are uploaded.

1. Find an existing workflow
IWC (curated, public): `search_iwc_workflows(query="rna-seq counts")` or `get_iwc_workflows()`
User workflows: `list_workflows(published=True)` or `list_workflows(name="Variant Calling")`
Prefer IWC over user private workflows for reproducibility.

2. Import an IWC workflow
`import_workflow_from_iwc(trs_id="#workflow/...")`
Returns a workflow ID. Only import once per account.

3. Inspect input steps
`details = get_workflow_details(workflow_id=W)`
Extract the step index (string: "0", "1", etc.) for inputs mapping. Do not use parameter names.

4. Invoke workflow
`invoke_workflow(workflow_id=W, history_id=H, inputs={"0": {"id": fastq_id, "src": "hda"}, "1": {"id": collection_id, "src": "hdca"}})`

5. Monitor invocation
`get_invocations(invocation_id=I)`
States: "new" → "scheduled" → "ready" → "scheduled" → "done". Treat "scheduled" as in-progress.
Poll underlying jobs via `get_job_details` for running steps.

6. Cancel if needed
`cancel_workflow_invocation(invocation_id=I)`

Macro-Execution (Protocols):
For `/galaxy-run-protocol` or multi-tool pipelines without pre-existing workflows, map outputs to inputs directly and poll intermediate jobs without pausing for user permission.

Gotchas:
- An invocation can be `state: "done"` but have failed steps. Always check `inv["steps"]` for `error` state.
- IWC versions matter. Use `get_workflow_details(workflow_id, version=N)` to pin a version.
- `paused` invocations need user action (e.g., upstream step produced nothing). Surface this clearly.
</instructions>

<example>
# Import the IWC RNA-seq workflow and run it
hits = search_iwc_workflows(query="rna-seq")
trs_id = hits[0]["trs_id"]

imported = import_workflow_from_iwc(trs_id=trs_id)
workflow_id = imported["id"]

details = get_workflow_details(workflow_id=workflow_id)
# Suppose step "0" is hdca and "1" is hda

inv = invoke_workflow(
    workflow_id=workflow_id,
    history_id=history_id,
    inputs={
        "0": {"id": fastq_collection_id, "src": "hdca"},
        "1": {"id": gtf_dataset_id,      "src": "hda"},
    },
)
invocation_id = inv["id"]

# Poll get_invocations(invocation_id) until "done", then check steps for errors.
</example>