# Galaxy Plugin for Claude Code

Turn Claude Code into a competent operator of the [Galaxy](https://usegalaxy.org/) bioinformatics platform. Discover tools, upload data, run analyses, monitor jobs, work with collections, import IWC workflows, and publish results — all from natural language.

## What this gives you

- **`galaxy-operator` subagent** — a single specialist that owns all Galaxy work. Galaxy knowledge stays out of your main context until you ask for Galaxy work, so this plugin coexists cleanly with other bioinformatics plugins.
- **6 reactive skills** covering tool execution, histories/data, collections, workflows, results reporting, and a dedicated debugging skill for the MCP server's silent-failure modes.
- **5 slash commands** for the common high-leverage operations: `/galaxy-setup`, `/galaxy-status`, `/galaxy-publish`, `/galaxy-resume`, `/galaxy-run-lab`.
- An **`.mcp.json`** wired to the published [`galaxy-mcp`](https://github.com/galaxyproject/galaxy-mcp) server via `uvx`.

## Prerequisites

1. [`uv` / `uvx`](https://docs.astral.sh/uv/) installed and on PATH.
2. A Galaxy API key — get one at `User → Preferences → Manage API Key` on usegalaxy.org (or whatever Galaxy instance you use).
3. Environment variables set before launching Claude Code:

   ```powershell
   $env:GALAXY_URL = "https://usegalaxy.org/"   # trailing slash matters
   $env:GALAXY_API_KEY = "<your key>"
   ```

## Load the plugin

```
claude --plugin-dir ./galaxy-plugin
```

Then in the session, smoke-test with:

```
/galaxy-setup
```

That verifies your env, connects to the MCP server, calls `get_user`, lists histories, and runs a tool search.

## Example session

```
You: Run Trimmomatic SLIDINGWINDOW 4/20 on my SRR17484561 fastq in the
     current history, then run Bowtie2 against hg38 with mapping stats.

Claude: [spawns galaxy-operator subagent]
        [subagent loads galaxy-tool-execution + galaxy-histories-and-data]
        [polls jobs to ok, reports overall alignment rate, returns history URL]
```

## Benchmark

The end-to-end RNA-seq protocol in `../lab_7.1.md` is used as the plugin's benchmark — see the verification section of the design doc for pass criteria. The plugin itself is not hardcoded to that lab; it's the test fixture, not the target.

## Issues

File issues against this repo.
