/**
 * JFactor Lab ops densest — harness open + arXiv prepare/open (not invent money).
 * Law: open GUI only when dry_run=false intentional · arXiv upload = human auth on site.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var { spawn, execFileSync } = require('child_process');

var DEFAULT_LAB = path.join(
  __dirname,
  '..',
  '..',
  'jfactor-lab'
);

function resolveLabRoot(opts) {
  opts = opts || {};
  if (opts.lab_root && fs.existsSync(opts.lab_root)) return path.resolve(opts.lab_root);
  var env = process.env.JFACTOR_LAB_ROOT;
  if (env && fs.existsSync(env)) return path.resolve(env);
  if (fs.existsSync(DEFAULT_LAB)) return DEFAULT_LAB;
  // sibling of living-core
  var sib = path.join(__dirname, '..', '..', 'jfactor-lab');
  if (fs.existsSync(sib)) return sib;
  return DEFAULT_LAB;
}

function status(opts) {
  var lab = resolveLabRoot(opts);
  var docs = path.join(lab, 'docs');
  var packScript = path.join(lab, 'scripts', 'pack_submit.sh');
  var harnessDoc = path.join(docs, 'HARNESS_SESSION.md');
  var arxivDoc = path.join(docs, 'ARXIV.md');
  var abstract = path.join(docs, 'ABSTRACT.md');
  var measures = path.join(docs, 'measures_latest.json');
  var zipGlob = path.join(lab, 'dist');
  var zips = [];
  try {
    if (fs.existsSync(zipGlob)) {
      zips = fs
        .readdirSync(zipGlob)
        .filter(function (f) {
          return /\.zip$/i.test(f);
        })
        .sort()
        .reverse();
    }
  } catch (_e) { /* */ }
  var m = null;
  try {
    if (fs.existsSync(measures)) m = JSON.parse(fs.readFileSync(measures, 'utf8'));
  } catch (_m) { /* */ }
  return {
    ok: true,
    lab_root: lab,
    exists: fs.existsSync(lab),
    has_harness_doc: fs.existsSync(harnessDoc),
    has_arxiv_doc: fs.existsSync(arxivDoc),
    has_abstract: fs.existsSync(abstract),
    has_pack_script: fs.existsSync(packScript),
    latest_zip: zips[0] ? path.join(zipGlob, zips[0]) : null,
    zips_n: zips.length,
    measures: m
      ? {
          at: m.at,
          hop0_tok: m.hop0 && m.hop0.tok_est,
          handoff_tok: m.handoff && m.handoff.handoff_tok_est,
          mcp_core: m.mcp && m.mcp.core_tok_est
        }
      : null,
    law: 'prepare densest · open grok/arxiv intentional · arXiv account human · never invent $',
    actions: ['status', 'prepare', 'harness', 'arxiv_open', 'seed']
  };
}

/**
 * Rebuild measures + submit pack zip densest.
 */
function prepare(opts) {
  opts = opts || {};
  var lab = resolveLabRoot(opts);
  var packScript = path.join(lab, 'scripts', 'pack_submit.sh');
  if (!fs.existsSync(packScript)) {
    return { ok: false, error: 'missing pack_submit.sh', lab_root: lab };
  }
  try {
    var out = execFileSync('/bin/bash', [packScript], {
      cwd: lab,
      encoding: 'utf8',
      timeout: 120000,
      env: process.env
    });
    var st = status({ lab_root: lab });
    writeSurface(lab, st, 'prepare');
    return {
      ok: true,
      did: 'pack_submit',
      lab_root: lab,
      latest_zip: st.latest_zip,
      measures: st.measures,
      log_tail: String(out || '').slice(-800)
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e && e.message),
      stderr: e && e.stderr ? String(e.stderr).slice(0, 400) : null,
      lab_root: lab
    };
  }
}

/**
 * Build densest seed prompt from HARNESS_SESSION.md + optional extra.
 */
function buildSeed(opts) {
  opts = opts || {};
  var lab = resolveLabRoot(opts);
  var harnessPath = path.join(lab, 'docs', 'HARNESS_SESSION.md');
  var seedPath = path.join(lab, 'docs', 'HARNESS_SEED.txt');
  var lines = [
    'JFactor Lab harness session seed.',
    'Law: Grok Build=harness · living-core=process · JFactor/Exp6=rank · never invent money · REVIEW human only.',
    'cwd: ' + lab,
    '',
    'Steps densest:',
    '1) living_sense host — quote open_next session last_capture perf',
    '2) living_token_view action=handoff modality=host',
    '3) Read docs/PROTOCOL_hop0.md and docs/hop0_latest.txt — map lines to protocol',
    '4) living_rank_cycle only if open_next is operate densest (not REVIEW approve unless user named ids)',
    '5) Paper edits only when measures/findings change — docs/ABSTRACT.md THESIS.md',
    ''
  ];
  if (fs.existsSync(harnessPath)) {
    try {
      var h = fs.readFileSync(harnessPath, 'utf8');
      var seeds = h.split('## Prompt seeds densest')[1] || h.split('## Prompt seeds')[1];
      if (seeds) {
        lines.push('--- from HARNESS_SESSION.md seeds ---');
        lines.push(seeds.slice(0, 1200).trim());
        lines.push('');
      }
    } catch (_e) { /* */ }
  }
  if (opts.extra) lines.push(String(opts.extra).slice(0, 500));
  var text = lines.join('\n');
  fs.mkdirSync(path.dirname(seedPath), { recursive: true });
  fs.writeFileSync(seedPath, text, 'utf8');
  return { ok: true, path: seedPath, chars: text.length, text_preview: text.slice(0, 240) };
}

/**
 * Open Grok Build in lab cwd with HARNESS seeds.
 * dry_run=true (default): plan only. dry_run=false: open Terminal + grok.
 */
function harness(opts) {
  opts = opts || {};
  var dry = opts.dry_run !== false && opts.apply !== true;
  var lab = resolveLabRoot(opts);
  var seed = buildSeed(opts);
  var seedPath = seed.path;
  var cmdPath = path.join(lab, 'scripts', 'harness_session.command');
  var script = [
    '#!/bin/bash',
    'cd ' + JSON.stringify(lab),
    'echo "=== JFactor Lab harness session ==="',
    'pwd',
    'grok --version 2>/dev/null || true',
    'node scripts/smoke_wire.js 2>/dev/null || true',
    'echo ""',
    'echo "Seed: ' + seedPath + '"',
    'echo "Opening grok with HARNESS_SESSION seed prompt..."',
    'echo ""',
    // pass first ~800 chars of seed as initial prompt
    'SEED=$(head -c 900 ' + JSON.stringify(seedPath) + ' | tr "\\n" " ")',
    'exec grok --cwd ' + JSON.stringify(lab) + ' "$SEED"'
  ].join('\n') + '\n';
  fs.writeFileSync(cmdPath, script, { mode: 0o755 });
  try {
    fs.chmodSync(cmdPath, 0o755);
  } catch (_c) { /* */ }

  if (dry) {
    return {
      ok: true,
      dry_run: true,
      lab_root: lab,
      seed: seed,
      command: cmdPath,
      note: 'set dry_run=false or apply=true to open Terminal+grok'
    };
  }

  try {
    // macOS: open .command in Terminal
    execFileSync('/usr/bin/open', ['-a', 'Terminal', cmdPath], {
      timeout: 15000
    });
    writeSurface(lab, status({ lab_root: lab }), 'harness_open');
    return {
      ok: true,
      dry_run: false,
      did: 'open Terminal+grok',
      lab_root: lab,
      seed: seed,
      command: cmdPath
    };
  } catch (e) {
    // fallback spawn grok headless-ish in background
    try {
      var child = spawn(
        'grok',
        ['--cwd', lab, fs.readFileSync(seedPath, 'utf8').slice(0, 400)],
        {
          cwd: lab,
          detached: true,
          stdio: 'ignore'
        }
      );
      child.unref();
      return {
        ok: true,
        dry_run: false,
        did: 'spawn grok detached',
        pid: child.pid,
        lab_root: lab,
        seed: seed,
        note: 'Terminal open failed; spawned grok detached'
      };
    } catch (e2) {
      return {
        ok: false,
        error: String(e && e.message) + ' | ' + String(e2 && e2.message),
        lab_root: lab,
        seed: seed
      };
    }
  }
}

/**
 * Open arXiv submit page + reveal zip densest.
 * True API upload needs author arXiv account (human) — we prepare + open.
 */
function arxivOpen(opts) {
  opts = opts || {};
  var dry = opts.dry_run !== false && opts.apply !== true;
  var lab = resolveLabRoot(opts);
  var prep = null;
  if (opts.prepare !== false) {
    prep = prepare({ lab_root: lab });
  }
  var st = status({ lab_root: lab });
  var url = opts.url || 'https://arxiv.org/submit';
  var plan = {
    ok: true,
    dry_run: dry,
    lab_root: lab,
    submit_url: url,
    latest_zip: st.latest_zip,
    abstract_path: path.join(lab, 'docs', 'ABSTRACT.md'),
    arxiv_guide: path.join(lab, 'docs', 'ARXIV.md'),
    prepare: prep,
    steps: [
      '1) pack prepared (zip densest)',
      '2) open arXiv submit (human login)',
      '3) paste ABSTRACT plain text from docs/ARXIV.md',
      '4) attach zip / PAPER.md as source'
    ],
    law: 'living-core prepares + opens · human authenticates arXiv · never invent $'
  };
  if (dry) {
    plan.note = 'set dry_run=false or apply=true to open browser + reveal zip';
    return plan;
  }
  try {
    execFileSync('/usr/bin/open', [url], { timeout: 10000 });
    plan.opened_url = true;
  } catch (e) {
    plan.opened_url = false;
    plan.url_error = String(e && e.message);
  }
  if (st.latest_zip && fs.existsSync(st.latest_zip)) {
    try {
      execFileSync('/usr/bin/open', ['-R', st.latest_zip], { timeout: 10000 });
      plan.revealed_zip = true;
    } catch (_r) {
      plan.revealed_zip = false;
    }
  }
  // open ARXIV.md guide
  var arxivMd = path.join(lab, 'docs', 'ARXIV.md');
  if (fs.existsSync(arxivMd)) {
    try {
      execFileSync('/usr/bin/open', [arxivMd], { timeout: 10000 });
      plan.opened_guide = true;
    } catch (_g) { /* */ }
  }
  writeSurface(lab, st, 'arxiv_open');
  plan.did = 'arxiv_open';
  return plan;
}

function writeSurface(lab, st, did) {
  try {
    var pages = path.join(
      path.dirname(lab),
      'living-core',
      'store',
      'pages'
    );
    // if lab sibling living-core
    if (!fs.existsSync(pages)) {
      pages = path.join(lab, 'living-core', 'store', 'pages');
    }
    if (!fs.existsSync(pages)) return;
    var p = path.join(pages, 'jfactor_lab_surface.md');
    var body = [
      '# jfactor_lab_surface',
      '',
      '- at: ' + new Date().toISOString(),
      '- did: ' + (did || 'status'),
      '- lab_root: ' + (st && st.lab_root),
      '- latest_zip: ' + (st && st.latest_zip),
      '- hop0_tok: ' + (st && st.measures && st.measures.hop0_tok),
      '- handoff_tok: ' + (st && st.measures && st.measures.handoff_tok),
      '- mcp_core: ' + (st && st.measures && st.measures.mcp_core),
      '',
      '## law',
      'prepare densest · harness/arxiv open intentional · arXiv human auth',
      '',
      '[[research_jfactor_lab]] [[operate_close]]',
      ''
    ].join('\n');
    fs.writeFileSync(p, body, 'utf8');
  } catch (_e) { /* */ }
}

/**
 * Dispatch: status|prepare|harness|arxiv_open|seed
 */
function dispatch(opts) {
  opts = opts || {};
  var action = String(opts.action || 'status').toLowerCase();
  if (action === 'status' || action === 'st') return status(opts);
  if (action === 'prepare' || action === 'pack') return prepare(opts);
  if (action === 'seed') return buildSeed(opts);
  if (action === 'harness' || action === 'grok' || action === 'open_harness') {
    return harness(opts);
  }
  if (
    action === 'arxiv_open' ||
    action === 'arxiv' ||
    action === 'upload' ||
    action === 'submit'
  ) {
    return arxivOpen(opts);
  }
  return {
    ok: false,
    error: 'unknown action',
    actions: ['status', 'prepare', 'seed', 'harness', 'arxiv_open'],
    note: 'arxiv_open prepares pack + opens submit URL (human auth)'
  };
}

module.exports = {
  resolveLabRoot: resolveLabRoot,
  status: status,
  prepare: prepare,
  buildSeed: buildSeed,
  harness: harness,
  arxivOpen: arxivOpen,
  dispatch: dispatch
};
