# Assembly Resolution & Per-History Assembly Registry

This document is the **canonical** source for picking a Galaxy reference genome and carrying it across every step of a protocol. If anything in another skill or command file conflicts with this file, this file wins.

The problem this prevents: an agent resolves `"latest assembly of GRCh38"` → `hg38Patch14` at step 2, but by step 5 (Bowtie2) the resolved value has fallen out of context and the agent silently falls back to a generic `hg38` from the dbkey-reference fallback table. That is a *catastrophic* drift in any downstream analysis.

The fix is to persist the resolution **to disk**, scoped to the Galaxy history, and gate every upload / tool call that touches a reference on a successful registry read.

---

## 1. Registry file

**Path:** `outputs/.galaxy-context/<history_id>.json` (relative to cwd, or to `$GALAXY_REGISTRY_DIR` if exported).

**Schema:**

```json
{
  "schema_version": 1,
  "history_id": "abc123",
  "history_name": "Lab 7.1 RNA-Seq Analysis",
  "created_at": "2026-05-27T03:24:00Z",
  "updated_at": "2026-05-27T03:25:10Z",
  "assemblies": [
    {
      "build_family": "GRCh38",
      "protocol_quote": "the latest assembly of GRCh38",
      "resolved_at": "2026-05-27T03:25:10Z",
      "rule_applied": "latest -> highest patch number among GRCh38 candidates",
      "candidates_considered": [
        "Homo sapiens GRCh38 (hg38)",
        "Homo sapiens GRCh38.p13 (hg38Patch13)",
        "Homo sapiens GRCh38.p14 (hg38Patch14)"
      ],
      "ui_label": "Homo sapiens GRCh38.p14 (hg38Patch14) [Aug 2022]",
      "upload_dbkey": "hg38Patch14",
      "tool_indexes": {
        "toolshed.g2.bx.psu.edu/repos/devteam/bowtie2/...": {
          "param": "reference_genome|index",
          "option_value": "hg38Patch14",
          "resolved_at": "2026-05-27T03:31:02Z"
        }
      }
    }
  ],
  "uploads": [
    {
      "dataset_id": "<hex>",
      "name": "genes.gtf",
      "dbkey": "hg38Patch14",
      "assembly_index": 0,
      "uploaded_at": "..."
    }
  ]
}
```

**Why per-history:** different analyses can use different builds; collision is impossible if the scope is the history that the data lives in.

**Why per-tool `option_value` inside the assembly:** the same logical build can have a different option value across tool wrappers (Bowtie2's index list and BWA's index list are independent caches on the server). Storing per-tool prevents a second silent rename downstream.

---

## 2. The helper

`bin/galaxy-assembly-registry.js` (invoked as `node ${CLAUDE_PLUGIN_ROOT}/bin/galaxy-assembly-registry.js`). It does atomic JSON writes (tmp + rename) so concurrent reads can't see half-written state.

**Subcommands** (only these — do not hand-author the JSON):

| Sub | Purpose |
| --- | --- |
| `path` | Print the absolute path of the registry file for a history. |
| `init` | Create an empty registry skeleton (idempotent). |
| `read` | Dump the registry, or just one assembly with `--build-family`. Exits 3 if absent. |
| `set-assembly` | Record the Phase 0 resolution for a build_family. Refuses to overwrite a different prior value unless `--allow-overwrite`. |
| `add-tool-index` | Add the per-tool option_value once you've resolved it for a specific consuming tool. |
| `add-upload` | Record a dataset id + the dbkey it was uploaded with. Helps audit drift. |

**Exit codes:**

- `0` success — registry was found / updated as requested.
- `2` user error — missing flag, malformed history-id.
- `3` not-found — `read` of a history with no registry, or no matching `build_family`. This is the signal that means *"run Phase 0"*. **Do not** swallow it.
- `4` conflict — `set-assembly` or `add-tool-index` would overwrite a different prior value. Stop and surface to the user; the protocol changed under you, or two callers disagree.
- `5` io error.

**Pattern for "look up or stop":**

```bash
HID="<history_id>"
node "$CLAUDE_PLUGIN_ROOT/bin/galaxy-assembly-registry.js" read \
    --history-id "$HID" --build-family GRCh38
# exit 0 -> JSON on stdout, use .assembly.upload_dbkey / .assembly.tool_indexes[...]
# exit 3 -> registry missing this build; STOP, run Phase 0 resolution, then set-assembly
```

In a shell-aware loop:

```bash
RESULT=$(node "$CLAUDE_PLUGIN_ROOT/bin/galaxy-assembly-registry.js" read \
    --history-id "$HID" --build-family GRCh38) || {
  echo "STOP: assembly registry missing for $HID/GRCh38 — run Phase 0" >&2
  exit 1
}
DBKEY=$(echo "$RESULT" | jq -r '.assembly.upload_dbkey')
```

---

## 3. Three mandatory gates

These gates replace the "remember the assertion" pattern. Each gate is checked by *reading the file* — not by recalling what the agent said earlier in the turn.

### Gate A — before every `upload_file*` call that sets `dbkey=`

1. Determine the `build_family` (from the protocol text — what species/build is being uploaded). Quote the original phrasing.
2. `read --history-id $HID --build-family $BF`.
3. **Hit** → use `.assembly.upload_dbkey` verbatim. Pass it to `upload_file_from_url(..., dbkey=<that>)`.
4. **Miss (exit 3)** → STOP. Run Phase 0 resolution (see §4), then `set-assembly`, then retry the upload.
5. After upload completes `ok`, call `add-upload` so the dataset id is recorded.

### Gate B — before every `run_tool` whose `inputs` contain a `reference_genome|index`, `genome`, `genomeSource`, or any other built-in reference picker tied to a dbkey

1. `read --history-id $HID --build-family $BF`.
2. **Build-family miss (exit 3)** → STOP. Same as Gate A: run Phase 0, set-assembly, retry.
3. **Hit but `tool_indexes[<this_tool_id>]` is empty** → resolve **once** for this tool:
   - `get_tool_details(tool_id=TOOL, io_details=True)` (the full options list is unavoidable here; save the response and use `jq` to slice).
   - Filter the options by the **base species keyword** (`Homo sapiens`, `Mus musculus`, etc.) and the **build keyword** (`GRCh38`, `GRCm38`, …). **Never** filter for the word "latest" — Galaxy never uses it literally.
   - Apply the same `rule_applied` stored in the registry (see §4 for rules).
   - `add-tool-index --tool-id <TOOL> --param <PARAM> --option-value <value>`.
4. **Hit with a recorded `option_value`** → use it verbatim.
5. Emit the ASSEMBLY ASSERTION block (see §5), then `run_tool`.

### Gate C — after every successful `upload_file*` and every `add-tool-index`

These are the write-back steps. They're what makes Gates A and B work for the *next* step. If you skip them, the next tool call falls into the "miss" branch and re-resolves — or, if the agent is sloppy, picks the fallback. Always write back.

---

## 4. Phase 0 resolution (only when the registry is missing the build_family)

Execute these strictly in order:

1. **Preserve modifiers.** Quote the genome-related sentence(s) from the protocol verbatim, inside `<protocol-genome>...</protocol-genome>` tags. **Never** append a worked dbkey example (e.g., `(b38): hg38`) — that gets read as authoritative by downstream code.
2. **Defer to a consuming tool.** Pick the first downstream tool that consumes a built-in reference index (typically the aligner). Run `get_tool_details(tool_id=TOOL, io_details=True)`.
3. **Enumerate.** Slice the options with `jq` filtered by base build keyword:
   ```bash
   jq '.. | objects | select(.name=="index") | .options[] | select(.[0] | test("(?i)<build-keyword>"))' <path>
   ```
   Do NOT search for "latest" — Galaxy option labels carry dates (`Jun 2023`) and patch numbers (`GRCm38.p6 (mm10Patch6)`), not the word "latest".
4. **Apply the resolution rule:**
   | Protocol phrasing | Rule |
   | --- | --- |
   | "latest" / "newest" / "most recent" | Most recent **date** in the labels. If no dates, highest **patch number**. |
   | "patch pN" / "pN" / "GRCh38.p14" | Exact patch match. |
   | A literal date | Exact date match. |
   | A partial UI-label prefix (e.g., `Human (Homo sapiens) (b38):`) | Pick the unique option whose label starts with that prefix. |
   | Bare build, no modifier (e.g., "hg38") | The option with **no** patch suffix and no newer dated variant. |
5. **Write back.** `set-assembly` with the protocol quote, build family, upload_dbkey (= the option value Galaxy expects for a `dbkey=` argument on uploads — usually the same as the index value), the UI label, the rule, and every candidate label you considered.
6. **Surface.** Print the ASSEMBLY RESOLUTION row in user-facing output (see §5).

If two protocol phases disagree (one says "latest", another says "GRCh38.p13"), STOP and ask the user — do not silently pick one.

---

## 5. ASSEMBLY ASSERTION block (still mandatory before every reference-touching tool call)

The block does not go away when there's a registry — it gains one line that says where the value came from. This makes transcripts auditable: future-you (or a reviewer) can tell whether the agent recalled-from-memory (bad) or pulled-from-disk (good).

```
ASSEMBLY ASSERTION
- Protocol asks for: "<verbatim quote from protocol — no paraphrase>"
- Source: registry [outputs/.galaxy-context/<history_id>.json] / just-resolved (writing back now)
- Galaxy candidates considered: <list>
- Picked: "<full UI label>" (option_value = "<dbkey/option id>")
- Why this satisfies the request: <one-sentence rule application>
```

Rules:
- Never skip the block. A missing block is itself a defect — stop and produce it.
- `Source: registry` is the **only** acceptable source for any tool call after Phase 0. If you find yourself writing `Source: training data` or `Source: dbkey-reference.md fallback`, STOP — the registry must be the source.
- The "Picked" value must come from Galaxy's live option list, not the fallback table in `galaxy-histories-and-data/references/dbkey-reference.md`.

---

## 6. Anti-patterns (don't do these)

- ❌ "I remember the dbkey from earlier, I'll just use it." Memory is the failure mode — read the file.
- ❌ Calling `set-assembly` before the protocol's genome phrasing has been quoted in a `<protocol-genome>` block.
- ❌ Calling `add-tool-index` before `set-assembly` — the helper will exit 3.
- ❌ Re-running `set-assembly` with a different value after the first analysis tool has already executed against the prior value. Use `--allow-overwrite` only if you've already manually corrected the prior outputs.
- ❌ Reading `.upload_dbkey` and passing it to a tool's index parameter without going through `add-tool-index` for that tool first. Different tools sometimes name the same build differently.
- ❌ Using the fallback table in `dbkey-reference.md` while a registry exists. The fallback table only applies to ad-hoc uploads with no consuming tool and no version modifier.
- ❌ Letting `read` exit 3 silently. Exit 3 means "run Phase 0" — surface it.
