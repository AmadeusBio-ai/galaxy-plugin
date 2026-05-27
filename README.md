# Galaxy Plugin for Claude Code

Turn Claude Code into a competent operator of the [Galaxy](https://usegalaxy.org/) bioinformatics platform. Discover tools, upload data, run analyses, monitor jobs, work with collections, import IWC workflows, and publish results — all from natural language.

## What this gives you

- **`galaxy-operator` subagent** — a single specialist that owns all Galaxy work. Galaxy knowledge stays out of your main context until you ask for Galaxy work, so this plugin coexists cleanly with other bioinformatics plugins.
- **6 reactive skills** covering tool execution, histories/data, collections, workflows, results reporting, and a dedicated debugging skill for the MCP server's silent-failure modes.
- **5 slash commands** for the common high-leverage operations: `/galaxy-setup`, `/galaxy-status`, `/galaxy-publish`, `/galaxy-resume`, `/galaxy-run-protocol`.
- A bundled MCP server entry wired to the published [`galaxy-mcp`](https://github.com/galaxyproject/galaxy-mcp) server via `uvx`, launched through `bin/galaxy-mcp-launcher.js` so credentials can come from either the shell or a persisted `.env`.

## Prerequisites

1. [`uv` / `uvx`](https://docs.astral.sh/uv/) installed and on PATH.
2. A Galaxy API key — get one at `User → Preferences → Manage API Key` on usegalaxy.org (or whatever Galaxy instance you use).

> **Security note.** Never paste your `GALAXY_API_KEY` into Claude's chat. The chat is written to the session transcript on disk, which makes the key recoverable by anyone with read access to that file. Use one of the two options below — both keep the key out of Claude's context. This plugin's `/galaxy:galaxy-setup` will **not** prompt you for the key.

### Option A — shell export (recommended)

Before launching Claude Code, export both vars in your shell.

Linux / macOS:

```bash
export GALAXY_URL="https://usegalaxy.org/"   # trailing slash matters
export GALAXY_API_KEY="<your key>"
```

Windows PowerShell:

```powershell
$env:GALAXY_URL = "https://usegalaxy.org/"   # trailing slash matters
$env:GALAXY_API_KEY = "<your key>"
```

Then `claude` from the same shell. The launcher inherits the vars and never touches disk.

### Option B — project `.env`

Using your own editor (not Claude), create `.env` in your project's working directory:

```
GALAXY_URL=https://usegalaxy.org/
GALAXY_API_KEY=<your key>
```

Then in your shell:

```bash
chmod 600 .env
echo .env >> .gitignore   # if this is a git repo
```

The launcher reads this file directly in bash; Claude does not. If you prefer a Galaxy-specific filename so the key doesn't share a file with other project secrets, use `.galaxy.env` instead — it's checked first and overrides `.env` when both exist.

**Resolution order** (first hit wins; values never overwritten by a later source): shell env → `./.galaxy.env` → `./.env`.

## Load the plugin

```
claude --plugin-dir ./galaxy-plugin
```

Then in the session, run:

```
/galaxy:galaxy-setup
```

This command **verifies** that the MCP server can reach Galaxy with the credentials the launcher resolved. It does not read your `.env` and does not prompt for the key. If nothing is configured, it prints the two options above and stops; configure one of them, run `/mcp` to reconnect the `galaxy` server (or restart Claude Code), and re-run `/galaxy:galaxy-setup`.

## Example session

Describe what you want in plain English; the operator subagent figures out which tools, histories, and skills to load.

```
You: I uploaded a BAM and a GTF to my "ChIP-seq Apr" history. Find peaks
     with MACS3, then give me the top 20 peaks by score.

Claude: [spawns galaxy-operator subagent]
        [subagent loads galaxy-tool-execution + galaxy-histories-and-data]
        [discovers MACS3 tool id, runs it, polls to ok, ranks peaks]
        [returns the top-20 table and the history URL]
```

For multi-step protocols (paper methods sections, vendor handbooks, your own SOPs), paste or path the markdown and run `/galaxy-run-protocol` — it phases the work, runs each step, checkpoints between phases, and honors any quality gates the protocol specifies.

## Issues

File issues against this repo.
