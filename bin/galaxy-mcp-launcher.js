#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || !line.indexOf('=') === -1) continue;
    
    const equalIdx = line.indexOf('=');
    if (equalIdx === -1) continue;

    let key = line.substring(0, equalIdx).trim();
    let val = line.substring(equalIdx + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

if (!process.env.GALAXY_URL || !process.env.GALAXY_API_KEY) {
  loadEnvFile(path.join(process.cwd(), '.galaxy.env'));
}
if (!process.env.GALAXY_URL || !process.env.GALAXY_API_KEY) {
  loadEnvFile(path.join(process.cwd(), '.env'));
}

if (!process.env.GALAXY_URL || !process.env.GALAXY_API_KEY) {
  console.error("galaxy-mcp-launcher: GALAXY_URL and/or GALAXY_API_KEY are not set.");
  console.error(`  Looked in: shell env, ${process.cwd()}/.galaxy.env, ${process.cwd()}/.env`);
  console.error("  Fix one of:");
  console.error("    1. Export both vars in the shell, then restart Claude Code:");
  console.error("         export GALAXY_URL=\"https://usegalaxy.org/\"");
  console.error("         export GALAXY_API_KEY=\"<your-key>\"");
  console.error(`    2. Create ${process.cwd()}/.env (or .galaxy.env) with:`);
  console.error("         GALAXY_URL=https://usegalaxy.org/");
  console.error("         GALAXY_API_KEY=<your-key>");
  console.error("       then chmod 600 the file and run /mcp to reconnect 'galaxy'.");
  console.error("  Do NOT paste your API key into Claude's chat; edit the file with your own editor.");
  process.exit(1);
}

// Ensure the child process uses the exact environment we've built, running uvx.
const child = spawn('uvx', ['galaxy-mcp'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32' // true on windows to properly invoke .cmd or .exe if needed
});

child.on('error', (err) => {
  console.error("galaxy-mcp-launcher: Failed to start uvx:", err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code !== null ? code : 1);
});
