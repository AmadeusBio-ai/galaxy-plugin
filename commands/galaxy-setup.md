---
description: Verify the Galaxy MCP server can reach Galaxy with the user's credentials. Does NOT read .env files or prompt for the API key.
---

Galaxy MCP setup verifier. **Critical security rules — follow these exactly:**

- **DO NOT** read `.env`, `.galaxy.env`, or any file that might contain `GALAXY_API_KEY`. No `Read`, no `cat`, `head`, `tail`, `less`, `grep`, `awk`, `sed`, no environment-file plugins. File existence checks (`test -f`, `ls`) are fine.
- **DO NOT** echo, print, or otherwise reveal `$GALAXY_API_KEY`. Only its length (e.g. `${#GALAXY_API_KEY}`) is allowed.
- **DO NOT** ask the user to paste their API key into the chat. The chat is written to the session transcript on disk. If the user volunteers the key anyway, refuse to write it and re-print the instructions block from step 2.
- **DO NOT** write any file containing the API key. The launcher reads credentials from the user's own `.env`; that is the only place the key should live on disk.

Steps:

1. **Detect state (no secret exposure).** Run exactly this Node.js command and report the four lines verbatim:

   ```bash
   node -e "
   console.log('shell GALAXY_URL=' + (process.env.GALAXY_URL || '<unset>'));
   if (process.env.GALAXY_API_KEY) {
     console.log('shell GALAXY_API_KEY=<set (' + process.env.GALAXY_API_KEY.length + ' chars)>');
   } else {
     console.log('shell GALAXY_API_KEY=<unset>');
   }
   const fs = require('fs');
   console.log('file .galaxy.env=' + (fs.existsSync('.galaxy.env') ? 'present' : 'absent'));
   console.log('file .env=' + (fs.existsSync('.env') ? 'present' : 'absent'));
   "
   ```

2. **Branch.**
   - If shell `GALAXY_URL` **and** shell `GALAXY_API_KEY` are set → go to step 3.
   - Else if either `.galaxy.env` or `.env` is present in the working directory → assume the launcher will resolve creds from one of them; go to step 3. (Do not open the file to verify; let the smoke test in step 3 prove or disprove it.)
   - Else → print the **Instructions block** below verbatim and STOP. Do not call AskUserQuestion. Do not call Bash again. End the turn.

   **Instructions block (print verbatim when neither shell nor a file is present):**

   ---
   > **No Galaxy credentials are reachable yet.** Pick one of the two options below. **Do not paste your API key into this chat** — anything in the chat is written to the session transcript on disk. Use your own editor or shell instead.
   >
   > **Option A — shell export (recommended).**
   > Quit Claude Code. In your shell, run:
   > ```bash
   > export GALAXY_URL="https://usegalaxy.org/"
   > export GALAXY_API_KEY="<your-key>"
   > ```
   > Then restart Claude Code in this directory and re-run `/galaxy:galaxy-setup`.
   >
   > **Option B — project `.env`.**
   > In your own editor (not Claude), create a file called `.env` in this directory with:
   > ```
   > GALAXY_URL=https://usegalaxy.org/
   > GALAXY_API_KEY=<your-key>
   > ```
   > Then in your shell: `chmod 600 .env` and add `.env` to your `.gitignore`. Run `/mcp` in Claude to reconnect the `galaxy` server, then re-run `/galaxy:galaxy-setup`.
   >
   > Get a key at `User → Preferences → Manage API Key` on your Galaxy instance.
   ---

3. **Smoke test.** Spawn the `galaxy:galaxy-operator` subagent with this brief:

   <brief>
   Call `get_user()`, `get_server_info()`, and `search_tools_by_name(query="trimmomatic")`. Report one-line pass/fail per call, with username/email for get_user and version for get_server_info. Do **not** look at `$GALAXY_URL` or `$GALAXY_API_KEY` in your own shell — the MCP server already has them and that is what you are testing.
   </brief>

   Return the subagent's report verbatim.

4. **On failure.** If the smoke test fails with auth/401, tell the user: "Your `GALAXY_API_KEY` looks wrong or expired. Update it in your shell export or in your `.env` (using your own editor), then run `/mcp` to reconnect the `galaxy` server and re-run `/galaxy:galaxy-setup`." Do **not** offer to read or edit the `.env` for them.
