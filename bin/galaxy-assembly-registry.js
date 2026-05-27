#!/usr/bin/env node
/*
 * galaxy-assembly-registry: per-history JSON store for resolved reference genomes.
 *
 * Goal: once Phase 0 picks a Galaxy dbkey / tool option for a build (e.g. GRCh38 ->
 * hg38Patch14), every later upload + tool call in the same history reads that value
 * back from disk instead of re-resolving (or vibing a generic fallback like "hg38").
 *
 * Storage: outputs/.galaxy-context/<history_id>.json relative to $GALAXY_REGISTRY_DIR
 * (when set) or cwd. Atomic writes via tmp + rename.
 *
 * Usage:
 *   galaxy-assembly-registry read --history-id H [--build-family GRCh38]
 *   galaxy-assembly-registry init --history-id H --history-name "..."
 *   galaxy-assembly-registry set-assembly --history-id H --build-family GRCh38 \
 *       --upload-dbkey hg38Patch14 --ui-label "..." --protocol-quote "..." \
 *       --rule-applied "..." [--candidate "label1" --candidate "label2"]
 *   galaxy-assembly-registry add-tool-index --history-id H --build-family GRCh38 \
 *       --tool-id "toolshed.../bowtie2/2.5.x" --param "reference_genome|index" \
 *       --option-value hg38Patch14
 *   galaxy-assembly-registry add-upload --history-id H --dataset-id D \
 *       --name genes.gtf --dbkey hg38Patch14 [--build-family GRCh38]
 *   galaxy-assembly-registry path --history-id H
 *
 * Exit codes:
 *   0 success
 *   2 user error (missing flag, bad JSON arg)
 *   3 not-found (read of unknown history or unknown build-family)
 *   4 conflict (set-assembly would overwrite an existing different dbkey)
 *   5 io error
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SCHEMA_VERSION = 1;

function parseArgs(argv) {
  const args = { _: [], _multi: {} };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        if (args[key] !== undefined) {
          if (!Array.isArray(args._multi[key])) args._multi[key] = [args[key]];
          args._multi[key].push(next);
        }
        args[key] = next;
        i++;
      }
    } else {
      args._.push(tok);
    }
  }
  return args;
}

function multi(args, key) {
  if (args._multi && args._multi[key]) return args._multi[key];
  if (args[key] !== undefined && args[key] !== true) return [args[key]];
  return [];
}

function require_(args, key) {
  if (args[key] === undefined || args[key] === true) {
    fail(2, `missing required --${key}`);
  }
  return args[key];
}

function fail(code, msg) {
  process.stderr.write(`galaxy-assembly-registry: ${msg}\n`);
  process.exit(code);
}

function registryDir() {
  const base = process.env.GALAXY_REGISTRY_DIR || path.join(process.cwd(), 'outputs', '.galaxy-context');
  return base;
}

function registryPath(historyId) {
  if (!historyId || typeof historyId !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(historyId)) {
    fail(2, `invalid --history-id (must match [A-Za-z0-9_.-]+): ${JSON.stringify(historyId)}`);
  }
  return path.join(registryDir(), `${historyId}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function emptyRegistry(historyId, historyName) {
  return {
    schema_version: SCHEMA_VERSION,
    history_id: historyId,
    history_name: historyName || null,
    created_at: nowIso(),
    updated_at: nowIso(),
    assemblies: [],
    uploads: [],
  };
}

function readRegistry(historyId) {
  const p = registryPath(historyId);
  if (!fs.existsSync(p)) return null;
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    fail(5, `failed to read ${p}: ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(5, `corrupt registry at ${p}: ${e.message}`);
  }
}

function writeRegistry(reg) {
  reg.updated_at = nowIso();
  const dir = registryDir();
  fs.mkdirSync(dir, { recursive: true });
  const p = registryPath(reg.history_id);
  const tmp = path.join(dir, `.${path.basename(p)}.${process.pid}.${Date.now()}.tmp`);
  const data = JSON.stringify(reg, null, 2) + '\n';
  fs.writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(tmp, p);
  return p;
}

function findAssembly(reg, buildFamily) {
  return reg.assemblies.find(a => a.build_family === buildFamily);
}

// ---------- subcommands ----------

function cmdPath(args) {
  const historyId = require_(args, 'history-id');
  process.stdout.write(registryPath(historyId) + '\n');
}

function cmdInit(args) {
  const historyId = require_(args, 'history-id');
  const historyName = args['history-name'] !== true ? args['history-name'] : null;
  let reg = readRegistry(historyId);
  if (reg) {
    if (historyName && !reg.history_name) reg.history_name = historyName;
  } else {
    reg = emptyRegistry(historyId, historyName);
  }
  const p = writeRegistry(reg);
  process.stdout.write(JSON.stringify({ ok: true, action: 'init', path: p, history_id: historyId }) + '\n');
}

function cmdRead(args) {
  const historyId = require_(args, 'history-id');
  const reg = readRegistry(historyId);
  if (!reg) {
    process.stdout.write(JSON.stringify({ ok: false, found: false, history_id: historyId }) + '\n');
    process.exit(3);
  }
  const buildFamily = args['build-family'] !== true ? args['build-family'] : undefined;
  if (buildFamily) {
    const a = findAssembly(reg, buildFamily);
    if (!a) {
      process.stdout.write(JSON.stringify({
        ok: false,
        found: true,
        history_id: historyId,
        build_family: buildFamily,
        reason: 'no assembly recorded for build_family',
        known_build_families: reg.assemblies.map(x => x.build_family),
      }) + '\n');
      process.exit(3);
    }
    process.stdout.write(JSON.stringify({ ok: true, found: true, history_id: historyId, assembly: a }, null, 2) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify({ ok: true, found: true, registry: reg }, null, 2) + '\n');
}

function cmdSetAssembly(args) {
  const historyId = require_(args, 'history-id');
  const buildFamily = require_(args, 'build-family');
  const uploadDbkey = require_(args, 'upload-dbkey');
  const uiLabel = require_(args, 'ui-label');
  const protocolQuote = require_(args, 'protocol-quote');
  const ruleApplied = require_(args, 'rule-applied');
  const candidates = multi(args, 'candidate');
  const historyName = args['history-name'] !== true ? args['history-name'] : null;
  const allowOverwrite = args['allow-overwrite'] === true;

  let reg = readRegistry(historyId) || emptyRegistry(historyId, historyName);
  if (historyName && !reg.history_name) reg.history_name = historyName;

  const existing = findAssembly(reg, buildFamily);
  if (existing && !allowOverwrite) {
    if (existing.upload_dbkey !== uploadDbkey || existing.ui_label !== uiLabel) {
      process.stderr.write(`conflict: build_family ${buildFamily} already resolved to dbkey=${existing.upload_dbkey} label=${JSON.stringify(existing.ui_label)}; refusing to overwrite without --allow-overwrite\n`);
      process.exit(4);
    }
    // idempotent re-set: leave entry alone, just update timestamps
    existing.resolved_at = existing.resolved_at || nowIso();
  } else {
    const entry = {
      build_family: buildFamily,
      protocol_quote: protocolQuote,
      resolved_at: nowIso(),
      rule_applied: ruleApplied,
      candidates_considered: candidates,
      ui_label: uiLabel,
      upload_dbkey: uploadDbkey,
      tool_indexes: existing ? existing.tool_indexes || {} : {},
    };
    if (existing) {
      const idx = reg.assemblies.indexOf(existing);
      reg.assemblies[idx] = entry;
    } else {
      reg.assemblies.push(entry);
    }
  }

  const p = writeRegistry(reg);
  process.stdout.write(JSON.stringify({
    ok: true, action: 'set-assembly', path: p, history_id: historyId,
    build_family: buildFamily, upload_dbkey: uploadDbkey,
  }) + '\n');
}

function cmdAddToolIndex(args) {
  const historyId = require_(args, 'history-id');
  const buildFamily = require_(args, 'build-family');
  const toolId = require_(args, 'tool-id');
  const param = require_(args, 'param');
  const optionValue = require_(args, 'option-value');

  const reg = readRegistry(historyId);
  if (!reg) fail(3, `registry not found for history ${historyId}; run set-assembly first`);
  const a = findAssembly(reg, buildFamily);
  if (!a) fail(3, `no assembly recorded for build_family ${buildFamily}; run set-assembly first`);

  a.tool_indexes = a.tool_indexes || {};
  const prior = a.tool_indexes[toolId];
  if (prior && prior.option_value !== optionValue && !args['allow-overwrite']) {
    process.stderr.write(`conflict: tool ${toolId} already mapped to option_value=${prior.option_value}; refusing to overwrite without --allow-overwrite\n`);
    process.exit(4);
  }
  a.tool_indexes[toolId] = {
    param,
    option_value: optionValue,
    resolved_at: nowIso(),
  };
  const p = writeRegistry(reg);
  process.stdout.write(JSON.stringify({
    ok: true, action: 'add-tool-index', path: p, history_id: historyId,
    build_family: buildFamily, tool_id: toolId, option_value: optionValue,
  }) + '\n');
}

function cmdAddUpload(args) {
  const historyId = require_(args, 'history-id');
  const datasetId = require_(args, 'dataset-id');
  const name = require_(args, 'name');
  const dbkey = require_(args, 'dbkey');
  const buildFamily = args['build-family'] !== true ? args['build-family'] : null;

  const reg = readRegistry(historyId) || emptyRegistry(historyId, null);
  let assemblyIndex = -1;
  if (buildFamily) {
    const a = findAssembly(reg, buildFamily);
    if (a) assemblyIndex = reg.assemblies.indexOf(a);
  } else {
    // best-effort: match by dbkey == upload_dbkey
    const a = reg.assemblies.find(x => x.upload_dbkey === dbkey);
    if (a) assemblyIndex = reg.assemblies.indexOf(a);
  }

  // dedupe by dataset_id
  reg.uploads = (reg.uploads || []).filter(u => u.dataset_id !== datasetId);
  reg.uploads.push({
    dataset_id: datasetId,
    name,
    dbkey,
    assembly_index: assemblyIndex >= 0 ? assemblyIndex : null,
    uploaded_at: nowIso(),
  });
  const p = writeRegistry(reg);
  process.stdout.write(JSON.stringify({
    ok: true, action: 'add-upload', path: p, history_id: historyId,
    dataset_id: datasetId, dbkey, assembly_index: assemblyIndex >= 0 ? assemblyIndex : null,
  }) + '\n');
}

function usage() {
  process.stderr.write(`Usage:
  galaxy-assembly-registry path --history-id H
  galaxy-assembly-registry init --history-id H [--history-name "..."]
  galaxy-assembly-registry read --history-id H [--build-family GRCh38]
  galaxy-assembly-registry set-assembly --history-id H --build-family GRCh38 \\
      --upload-dbkey hg38Patch14 --ui-label "..." --protocol-quote "..." \\
      --rule-applied "..." [--candidate "label1" --candidate "label2"] \\
      [--history-name "..."] [--allow-overwrite]
  galaxy-assembly-registry add-tool-index --history-id H --build-family GRCh38 \\
      --tool-id "..." --param "reference_genome|index" --option-value hg38Patch14 \\
      [--allow-overwrite]
  galaxy-assembly-registry add-upload --history-id H --dataset-id D --name N \\
      --dbkey hg38Patch14 [--build-family GRCh38]
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    usage();
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const sub = argv[0];
  const args = parseArgs(argv.slice(1));
  switch (sub) {
    case 'path': return cmdPath(args);
    case 'init': return cmdInit(args);
    case 'read': return cmdRead(args);
    case 'set-assembly': return cmdSetAssembly(args);
    case 'add-tool-index': return cmdAddToolIndex(args);
    case 'add-upload': return cmdAddUpload(args);
    default:
      usage();
      fail(2, `unknown subcommand: ${sub}`);
  }
}

main();
