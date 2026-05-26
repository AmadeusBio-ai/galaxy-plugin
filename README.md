# Galaxy Plugin for Claude Code

Turn Claude Code into a competent operator of the [Galaxy](https://usegalaxy.org/) bioinformatics platform. Discover tools, upload data, run analyses, monitor jobs, work with collections, import IWC workflows, and publish results — all from natural language.

## What this gives you

- **`galaxy-operator` subagent** — a single specialist that owns all Galaxy work. Galaxy knowledge stays out of your main context until you ask for Galaxy work, so this plugin coexists cleanly with other bioinformatics plugins.
- **6 reactive skills** covering tool execution, histories/data, collections, workflows, results reporting, and a dedicated debugging skill for the MCP server's silent-failure modes.
- **5 slash commands** for the common high-leverage operations: `/galaxy-setup`, `/galaxy-status`, `/galaxy-publish`, `/galaxy-resume`, `/galaxy-run-lab`.
- A bundled MCP server entry wired to the published [`galaxy-mcp`](https://github.com/galaxyproject/galaxy-mcp) server via `uvx`, launched through `bin/galaxy-mcp-launcher.sh` so credentials can come from either the shell or a persisted `.env`.

## Prerequisites

1. [`uv` / `uvx`](https://docs.astral.sh/uv/) installed and on PATH.
2. A Galaxy API key — get one at `User → Preferences → Manage API Key` on usegalaxy.org (or whatever Galaxy instance you use).
3. Provide the URL and API key in one of two ways. The plugin's launcher checks the shell first, then falls back to a persisted `.env`.

   **a) Shell env (recommended for power users)** — before launching Claude Code:

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

   .env file (cross platform):

   create .env file inside working directory with

   ```
   # Inside a file named .env
   GALAXY_URL=https://usegalaxy.org/
   GALAXY_API_KEY=<your key>
   ```

   **b) Prompted (no shell setup)** — just load the plugin (see below), then run `/galaxy:galaxy-setup`. The command prompts you for the URL and key and persists them (mode 0600) to `${CLAUDE_PLUGIN_DATA}/galaxy.env`. Shell-provided values always win over the `.env` file, so option (a) takes precedence whenever both are present.

## Load the plugin

```
claude --plugin-dir ./galaxy-plugin
```

Then in the session, run:

```
/galaxy:galaxy-setup
```

If the shell already has `GALAXY_URL` and `GALAXY_API_KEY`, the command just smoke-tests the connection. Otherwise it prompts you for them, writes them to `${CLAUDE_PLUGIN_DATA}/galaxy.env`, and asks you to reconnect via `/mcp` (or restart Claude Code).

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
