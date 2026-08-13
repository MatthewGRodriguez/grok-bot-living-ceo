/**
 * Scaffold a probe modality package from a host external (app/cli/…).
 * Grok (outer author) may refine docs/effectiveness after scaffold.
 * Never auto-installs every external — only explicit scaffold calls.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var surface = require('./surface');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'probe';
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeIfMissing(filePath, content, force) {
  if (!force && fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

/**
 * @param {string} rootDir living-core root
 * @param {object} opts
 * @param {string} opts.external_id e.g. app:Cursor or cli:git
 * @param {string} [opts.id] modality id override
 * @param {string} [opts.parent_id] default host
 * @param {boolean} [opts.force] overwrite existing files
 */
function scaffoldProbe(rootDir, opts) {
  opts = opts || {};
  var externalId = opts.external_id || opts.externalId;
  if (!externalId) {
    return { ok: false, error: 'external_id required (e.g. app:Cursor, cli:git)' };
  }

  var resolved = surface.resolveExternal(externalId, rootDir);
  if (!resolved.ok) return resolved;
  if (resolved.kind !== 'app' && resolved.kind !== 'cli') {
    return {
      ok: false,
      error: 'scaffold_supports_app_and_cli_only',
      kind: resolved.kind,
      note: 'capabilities and stores stay as explore findings'
    };
  }

  var modId = opts.id || ('probe_' + resolved.kind + '_' + slugify(resolved.name));
  if (!/^[a-z][a-z0-9_]*$/.test(modId)) {
    return { ok: false, error: 'invalid_modality_id', id: modId };
  }
  if (modId === 'host' || modId === 'data') {
    return { ok: false, error: 'reserved_id', id: modId };
  }

  var parentId = opts.parent_id != null ? opts.parent_id : 'host';
  var modDir = path.join(rootDir, 'modalities', modId);
  var force = !!opts.force;

  if (fs.existsSync(modDir) && !force) {
    return {
      ok: false,
      error: 'already_exists',
      id: modId,
      dir: modDir,
      note: 'pass force=true to overwrite, or choose another id'
    };
  }

  ensureDir(path.join(modDir, 'docs'));
  ensureDir(path.join(modDir, 'lambda'));

  var exo = require('./exotelos');
  var exoPack = exo.create({
    origin: modId,
    primary: {
      interest: 'verify ' + resolved.id + ' addressable',
      pole_a: 'absent',
      pole_b: 'verified'
    },
    secondary: {
      interest: 'safe invoke without shell thrash',
      pole_a: 'unsafe',
      pole_b: 'fail_closed'
    },
    exotelos: {
      other_origin: parentId === 'host' ? 'outer_author' : parentId,
      other_primary: 'parent open goal',
      other_secondary: 'parent bytes/debt',
      intention:
        'hope that ' +
        (parentId || 'parent') +
        ' independently develops densest use of ' +
        resolved.name +
        ' beyond this probe',
      recursion: 0
    },
    endotelos: ['probe samples', 'invoke evidence']
  });
  var manifest = {
    id: modId,
    parent_id: parentId,
    status: 'probe',
    codec: 'attention-live-v1',
    bytes: { cap_share: 0.05 },
    external: {
      id: resolved.id,
      kind: resolved.kind,
      name: resolved.name,
      path: resolved.path || null
    },
    boot_goal: 'Probe ' + resolved.kind + ' ' + resolved.name +
      ' under host goal; verify addressability; graduate only if useful.',
    exotelos: {
      primary: exoPack.primary,
      secondary: exoPack.secondary,
      exotelos: exoPack.exotelos,
      endotelos: exoPack.endotelos
    }
  };
  writeIfMissing(
    path.join(modDir, 'MANIFEST.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    force
  );

  var how = [
    '# modality:' + modId + ' — probe of ' + resolved.id,
    '',
    '**Status:** probe (not auto-stable). Parent: `' + parentId + '`.',
    '',
    '## Source external',
    '- id: `' + resolved.id + '`',
    '- kind: `' + resolved.kind + '`',
    '- name: `' + resolved.name + '`',
    resolved.path ? '- path: `' + resolved.path + '`' : '',
    '',
    '## Law',
    '- SimulatedBest: effectiveness only — **no** open/spawn.',
    '- Real Best: verify presence; optional light work. Prefer `living_invoke` for intentional tool use.',
    '- Graduation only if outputs help parent goal under bytes.',
    '',
    '## Invoke',
    'Use MCP `living_invoke` with `external_id: "' + resolved.id + '"`',
    resolved.kind === 'app'
      ? ' (opens via `open -a "' + resolved.name + '"`).'
      : ' (runs allowlisted CLI via execFile, no shell).',
    ''
  ].filter(Boolean).join('\n');

  var workflow = [
    '# ' + modId + ' WORKFLOW',
    '',
    'Child of **' + parentId + '**. Ranked as a jmethod:',
    '',
    '> If we enter **' + modId + '** now, how much do we advance the parent open goal?',
    '',
    '- Probes start with **low prior** so stable children (e.g. data) win unless needed.',
    '- Prefer verify-only on Best; use living_invoke for deliberate Mac tool use.',
    ''
  ].join('\n');

  var goals = [
    '# ' + modId + ' GOALS',
    '',
    '- [ ] Verify ' + resolved.id + ' is addressable from host',
    '- [ ] Expose safe invoke path without shell injection',
    '- [ ] Graduate only if host goal benefits under bytes',
    ''
  ].join('\n');

  var research = [
    '# ' + modId + ' RESEARCH',
    '',
    '## Scaffold',
    '- Generated from explore external `' + resolved.id + '`',
    '- Kind: ' + resolved.kind,
    '',
    '## Open',
    '- Tune effectiveness to parent goal after real use samples',
    ''
  ].join('\n');

  var externals = [
    '# ' + modId + ' EXTERNALS',
    '',
    'Findings from explore-externals (append-only).',
    '',
    '## seed',
    '- ' + resolved.id + ' (' + resolved.kind + ')',
    ''
  ].join('\n');

  writeIfMissing(path.join(modDir, 'docs', 'HOW.md'), how, force);
  writeIfMissing(path.join(modDir, 'docs', 'WORKFLOW.md'), workflow, force);
  writeIfMissing(path.join(modDir, 'docs', 'GOALS.md'), goals, force);
  writeIfMissing(path.join(modDir, 'docs', 'RESEARCH.md'), research, force);
  writeIfMissing(path.join(modDir, 'docs', 'EXTERNALS.md'), externals, force);
  writeIfMissing(
    path.join(modDir, 'docs', 'EXOTELOS.md'),
    exo.renderDoc(exoPack),
    force
  );
  var probeBonds = [
    {
      to: parentId || 'host',
      fear: 'afraid parent ranks me for thrash open',
      role: 'you gate intentional invoke',
      covenant:
        'I verify ' +
        resolved.name +
        ' only; you invoke densest with dry_run first',
      incantatory:
        'Drop probe Best priority if you auto-open without parent goal'
    }
  ];
  manifest.bonds = probeBonds.map(function (b) {
    return exo.normalizeBond(b, modId);
  });
  writeIfMissing(
    path.join(modDir, 'MANIFEST.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    true
  );
  writeIfMissing(
    path.join(modDir, 'docs', 'BONDS.md'),
    exo.renderBondsDoc(modId, probeBonds),
    force
  );

  var lambdaSrc = buildLambdaSource(resolved);
  writeIfMissing(path.join(modDir, 'lambda', 'index.js'), lambdaSrc, force);

  return {
    ok: true,
    id: modId,
    status: 'probe',
    dir: modDir,
    external: {
      id: resolved.id,
      kind: resolved.kind,
      name: resolved.name,
      path: resolved.path || null
    },
    note: 'Probe package written. Call living_reload, then rank. Use living_invoke for intentional tool use.'
  };
}

function buildLambdaSource(resolved) {
  var kind = resolved.kind;
  var name = resolved.name;
  var extId = resolved.id;
  var pathJson = JSON.stringify(resolved.path || null);

  return [
    '/**',
    ' * Auto-scaffolded probe for ' + extId,
    ' * simulated → effectiveness only; real Best → verify presence (no surprise opens).',
    ' */',
    "'use strict';",
    '',
    "var fs = require('fs');",
    "var path = require('path');",
    "var surface = require(path.join(__dirname, '..', '..', '..', 'src', 'surface'));",
    '',
    'var EXTERNAL_ID = ' + JSON.stringify(extId) + ';',
    'var EXTERNAL_KIND = ' + JSON.stringify(kind) + ';',
    'var EXTERNAL_NAME = ' + JSON.stringify(name) + ';',
    'var EXTERNAL_PATH = ' + pathJson + ';',
    '',
    'function effectiveness(state) {',
    '  // Probes stay below stable data (~0.75/0.8) unless later tuned',
    '  var base = state.simulated ? 0.28 : 0.32;',
    '  if (state.verified) base += 0.08;',
    '  // P8: intentional invoke evidence lifts prior (not rank verify alone)',
    '  try {',
    "    var invLog = require(path.join(__dirname, '..', '..', '..', 'src', 'invoke_log'));",
    "    var root = path.join(__dirname, '..', '..', '..');",
    '    var inv = invLog.statsForExternal(root, EXTERNAL_ID);',
    '    if (inv.ok_n >= 1) base = Math.min(0.42, base + 0.08);',
    '    if (inv.ok_n >= 2) base = Math.min(0.48, base + 0.04);',
    '  } catch (_e) { /* */ }',
    '  return base;',
    '}',
    '',
    'function work(state) {',
    '  // Real Best: verify only — intentional opens go through living_invoke',
    '  try {',
    "    if (EXTERNAL_KIND === 'app') {",
    '      state.verified = !!(EXTERNAL_PATH && fs.existsSync(EXTERNAL_PATH));',
    "    } else if (EXTERNAL_KIND === 'cli') {",
    '      state.verified = !!(EXTERNAL_PATH && fs.existsSync(EXTERNAL_PATH));',
    '    } else {',
    '      state.verified = false;',
    '    }',
    "    state.did = state.verified ? ('verified:' + EXTERNAL_ID) : ('missing:' + EXTERNAL_ID);",
    '  } catch (e) {',
    "    state.did = 'verify_error:' + e.message;",
    '    state.verified = false;',
    '  }',
    '}',
    '',
    'function explore() {',
    '  return [{ id: EXTERNAL_ID, kind: EXTERNAL_KIND }];',
    '}',
    '',
    'module.exports = {',
    '  effectiveness: effectiveness,',
    '  work: work,',
    '  explore: explore,',
    '  EXTERNAL_ID: EXTERNAL_ID',
    '};',
    ''
  ].join('\n');
}

module.exports = {
  scaffoldProbe: scaffoldProbe,
  slugify: slugify
};
