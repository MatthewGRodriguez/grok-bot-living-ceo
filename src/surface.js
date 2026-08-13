/**
 * Host machine surface: discover apps, CLIs, and capabilities.
 * Explore only — does not install modalities or run side-effect work.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var { execFileSync } = require('child_process');

/** Common CLIs worth surfacing as probe candidates (not every PATH binary). */
var CLI_CANDIDATES = [
  'open',
  'osascript',
  'shortcuts',
  'git',
  'curl',
  'node',
  'npm',
  'python3',
  'swift',
  'pbcopy',
  'pbpaste',
  'mdfind',
  'screencapture',
  'say',
  'caffeinate',
  'launchctl',
  'defaults',
  'xcrun',
  'code',
  'cursor'
];

var DEFAULT_APP_DIRS = [
  '/Applications',
  path.join(os.homedir(), 'Applications')
];

function safeReaddir(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir);
  } catch (_e) {
    return [];
  }
}

function which(bin) {
  try {
    var out = execFileSync('/usr/bin/which', [bin], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return out || null;
  } catch (_e) {
    // Fallback: check common absolute locations without shell
    var fallbacks = [
      '/usr/bin/' + bin,
      '/usr/local/bin/' + bin,
      '/opt/homebrew/bin/' + bin,
      path.join(os.homedir(), '.local', 'bin', bin)
    ];
    for (var i = 0; i < fallbacks.length; i++) {
      try {
        if (fs.existsSync(fallbacks[i])) return fallbacks[i];
      } catch (_e2) { /* */ }
    }
    return null;
  }
}

/**
 * List .app bundles under Application folders.
 * Returns { name, path, id } where id is app:<Name without .app>.
 */
function listApps(opts) {
  opts = opts || {};
  var max = opts.max != null ? opts.max : 80;
  var dirs = opts.dirs || DEFAULT_APP_DIRS;
  var seen = Object.create(null);
  var apps = [];

  dirs.forEach(function (dir) {
    safeReaddir(dir).forEach(function (ent) {
      if (!ent.endsWith('.app')) return;
      var name = ent.replace(/\.app$/, '');
      var key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var full = path.join(dir, ent);
      apps.push({
        id: 'app:' + name,
        kind: 'app',
        name: name,
        path: full,
        note: 'macOS app bundle — scaffold probe to open via `open -a`'
      });
    });
  });

  apps.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  return apps.slice(0, max);
}

/**
 * Resolve allowlisted CLI binaries on PATH / known locations.
 */
function listClis(opts) {
  opts = opts || {};
  var names = opts.names || CLI_CANDIDATES;
  var skipCache = !!opts.no_cache || !!opts.thorough;
  var now = Date.now();
  // P15: soft-cache which() results (stable PATH; avoid every rankCycle)
  if (
    !skipCache &&
    _clisCache.clis &&
    now - _clisCache.at < CLIS_CACHE_MS
  ) {
    return _clisCache.clis;
  }
  // mem_critical: never re-which if we have any cache
  if (opts.mem_critical && _clisCache.clis) {
    return _clisCache.clis;
  }
  var seen = Object.create(null);
  var clis = [];
  names.forEach(function (name) {
    if (seen[name]) return;
    seen[name] = true;
    var resolved = which(name);
    if (!resolved) return;
    clis.push({
      id: 'cli:' + name,
      kind: 'cli',
      name: name,
      path: resolved,
      note: 'allowlisted CLI — scaffold probe or living_invoke'
    });
  });
  if (!skipCache || opts.mem_critical) {
    _clisCache = { at: now, clis: clis };
  }
  return clis;
}

/**
 * Capability flags for host process (what tools *could* do).
 * Includes densest hardware/accel probes for loop optimization research.
 * @param {object} [opts]
 * @param {boolean} [opts.no_cache] — force refresh
 * @param {boolean} [opts.mem_critical] — never ensureWasm; refresh free_gb only
 */
function listCapabilities(opts) {
  opts = opts || {};
  var now = Date.now();
  // P17: soft-cache full caps; under mem_critical reuse and only patch free_gb
  if (
    !opts.no_cache &&
    _capsCache.caps &&
    (opts.mem_critical || now - _capsCache.at < CAPS_CACHE_MS)
  ) {
    var cached = _capsCache.caps.map(function (c) {
      return Object.assign({}, c);
    });
    try {
      var freePatch = os.freemem() / (1024 * 1024 * 1024);
      var memGBPatch = os.totalmem() / (1024 * 1024 * 1024);
      cached.forEach(function (c) {
        if (c.id === 'hw:mem') {
          c.note =
            'total_gb=' +
            memGBPatch.toFixed(1) +
            ' free_gb=' +
            freePatch.toFixed(2) +
            (freePatch < 0.5 ? ' · pressure=high' : '');
        }
      });
    } catch (_p) { /* */ }
    return cached;
  }

  var caps = [];
  caps.push({
    id: 'cap:spawn',
    kind: 'capability',
    available: true,
    note: 'child_process.execFile available in host Node process'
  });
  caps.push({
    id: 'cap:open',
    kind: 'capability',
    available: !!which('open'),
    note: 'macOS open(1) — launch apps / URLs'
  });
  caps.push({
    id: 'cap:osascript',
    kind: 'capability',
    available: !!which('osascript'),
    note: 'AppleScript bridge (use carefully; probe-gated)'
  });
  caps.push({
    id: 'cap:shortcuts',
    kind: 'capability',
    available: !!which('shortcuts'),
    note: 'macOS Shortcuts CLI if present'
  });
  caps.push({
    id: 'cap:fs_home',
    kind: 'capability',
    available: fs.existsSync(os.homedir()),
    note: 'read home directory path'
  });
  caps.push({
    id: 'cap:fs_cwd',
    kind: 'capability',
    available: true,
    note: 'process.cwd() = ' + process.cwd()
  });

  // --- Hardware / accel densest (P10 research) ---
  var ncpu = os.cpus() ? os.cpus().length : 0;
  var memGB = os.totalmem() / (1024 * 1024 * 1024);
  var freeGB = os.freemem() / (1024 * 1024 * 1024);
  caps.push({
    id: 'hw:cpu',
    kind: 'hardware',
    available: ncpu > 0,
    note: (os.cpus()[0] && os.cpus()[0].model ? os.cpus()[0].model : 'cpu') +
      ' · n=' + ncpu + ' arch=' + process.arch
  });
  caps.push({
    id: 'hw:mem',
    kind: 'hardware',
    available: true,
    note: 'total_gb=' + memGB.toFixed(1) + ' free_gb=' + freeGB.toFixed(2) +
      (freeGB < 0.5 ? ' · pressure=high' : '')
  });
  caps.push({
    id: 'accel:wasm',
    kind: 'accel',
    available: typeof WebAssembly !== 'undefined',
    note: 'Exp6 kernels.wasm / SIMD path when ensureWasm'
  });
  var simdOk = false;
  var metalNote = 'Metal GPU on Apple Silicon (Exp6 jfactor_exp6_gpu optional)';
  // P17: skip ensureWasm under mem_critical (RAM thrash / cold load cost)
  if (!opts.mem_critical) {
    try {
      var simdMod = require(path.join(__dirname, '..', 'vendor', 'exp6', 'jfactor_exp6_simd.js'));
      if (simdMod.ensureWasm) simdMod.ensureWasm();
      simdOk = !!(simdMod.simd || simdMod.wasmReady || simdMod.ready);
    } catch (_e) {
      simdOk = typeof WebAssembly !== 'undefined';
    }
  } else {
    simdOk = typeof WebAssembly !== 'undefined';
  }
  caps.push({
    id: 'accel:simd',
    kind: 'accel',
    available: simdOk,
    note: 'WASM SIMD batch score (fieldBest/score_batch_soa)'
  });
  caps.push({
    id: 'accel:metal',
    kind: 'accel',
    available: process.platform === 'darwin' && process.arch === 'arm64',
    note: metalNote
  });
  caps.push({
    id: 'accel:workers',
    kind: 'accel',
    available: true,
    note: 'worker_threads for independent score fan-out (Exp6 tools/exp6_score_worker)'
  });
  caps.push({
    id: 'accel:compress',
    kind: 'accel',
    available: true,
    note: 'zlib/brotli/zstd in Node; densify.md for EXTERNALS; samples soft-trim'
  });
  if (!opts.no_cache) {
    _capsCache = { at: now, caps: caps };
  }
  return caps;
}

// Explore app list is expensive — soft-cache under loop time budget
var _appsCache = { at: 0, apps: null };
var APPS_CACHE_MS = 15000;
// P15: CLI which() fan-out is second-cost after apps — soft-cache
var _clisCache = { at: 0, clis: null };
var CLIS_CACHE_MS = 30000;
// P17: capabilities (which + optional ensureWasm) soft-cache
var _capsCache = { at: 0, caps: null };
var CAPS_CACHE_MS = 60000;

/**
 * Full host explore surface: base machine + apps + clis + capabilities.
 * Does not auto-install modalities.
 * @param {object} [opts]
 * @param {boolean} [opts.thorough] — skip apps soft-cache (slower, fresher surface)
 */
function exploreHost(rootDir, registry, opts) {
  opts = opts || {};
  registry = registry || {};
  var thorough = !!opts.thorough;
  // P14: mem-critical / skip_apps — never re-scan /Applications (use cache or none)
  var skipApps = !!opts.skip_apps || !!opts.mem_critical;
  var found = [];

  found.push({ id: 'os:' + process.platform, kind: 'os' });
  found.push({ id: 'arch:' + process.arch, kind: 'arch' });
  found.push({ id: 'node:' + process.version, kind: 'runtime' });
  found.push({ id: 'cwd:' + process.cwd(), kind: 'path' });
  found.push({ id: 'home:' + os.homedir(), kind: 'path' });

  var exportDir = path.join(rootDir, 'store', 'exports');
  found.push({
    id: 'store:exports',
    kind: 'store',
    empty: !fs.existsSync(exportDir) || fs.readdirSync(exportDir).length === 0
  });

  Object.keys(registry).forEach(function (id) {
    if (id === 'host') return;
    found.push({
      id: 'modality:' + id,
      kind: 'modality_package',
      status: registry[id].status,
      note: 'candidate already installed — may spawn probes of sub-externals later'
    });
  });

  var caps = listCapabilities({
    mem_critical: skipApps,
    no_cache: thorough && !skipApps
  });
  found = found.concat(caps);

  var clis = listClis({
    thorough: thorough && !skipApps,
    mem_critical: skipApps
  });
  found = found.concat(clis);

  // Soft-cache /Applications scan (dominant explore cost on host rankCycle).
  // thorough=true: skip cache — speed isn't everything when densest freshness matters.
  // mem_critical/skip_apps: never listApps — cache only (or empty) under free_gb stress.
  var now = Date.now();
  var apps;
  if (skipApps) {
    apps = _appsCache.apps || [];
    found.push({
      id: 'explore:apps_skipped_mem',
      kind: 'signal',
      available: true,
      note: 'P14 mem-critical: /Applications not re-scanned'
    });
  } else if (
    !thorough &&
    _appsCache.apps &&
    now - _appsCache.at < APPS_CACHE_MS
  ) {
    apps = _appsCache.apps;
  } else {
    apps = listApps({ max: 80 });
    _appsCache = { at: now, apps: apps };
  }
  found = found.concat(apps);

  return {
    externals: found,
    summary: {
      base: 6 + Object.keys(registry).filter(function (id) { return id !== 'host'; }).length,
      capabilities: caps.length,
      clis: clis.length,
      apps: apps.length,
      apps_skipped: skipApps,
      total: found.length
    }
  };
}

/**
 * Resolve an external id to a concrete target for invoke/scaffold.
 * @returns {{ ok, kind, name, path?, error? }}
 */
function resolveExternal(externalId, rootDir) {
  if (!externalId || typeof externalId !== 'string') {
    return { ok: false, error: 'external_id required' };
  }
  var id = externalId.trim();

  if (id.indexOf('app:') === 0) {
    var appName = id.slice(4);
    var apps = listApps({ max: 200 });
    var hit = apps.find(function (a) {
      return a.name === appName || a.name.toLowerCase() === appName.toLowerCase();
    });
    if (!hit) {
      // Allow exact bundle path if still present
      var tryPath = path.join('/Applications', appName + '.app');
      if (!fs.existsSync(tryPath)) {
        tryPath = path.join(os.homedir(), 'Applications', appName + '.app');
      }
      if (fs.existsSync(tryPath)) {
        return { ok: true, kind: 'app', name: appName, path: tryPath, id: id };
      }
      return { ok: false, error: 'unknown_app', id: id };
    }
    return { ok: true, kind: 'app', name: hit.name, path: hit.path, id: hit.id };
  }

  if (id.indexOf('cli:') === 0) {
    var cliName = id.slice(4);
    var clis = listClis();
    var c = clis.find(function (x) { return x.name === cliName; });
    if (!c) return { ok: false, error: 'cli_not_allowlisted_or_missing', id: id };
    return { ok: true, kind: 'cli', name: c.name, path: c.path, id: c.id };
  }

  if (id.indexOf('cap:') === 0) {
    return { ok: true, kind: 'capability', name: id.slice(4), id: id };
  }

  if (id.indexOf('modality:') === 0) {
    return { ok: true, kind: 'modality_package', name: id.slice(9), id: id };
  }

  // bare app name convenience
  var asApp = resolveExternal('app:' + id, rootDir);
  if (asApp.ok) return asApp;

  return { ok: false, error: 'unresolvable_external', id: id };
}

/**
 * Safe invoke of an app or allowlisted CLI.
 * Apps: open -a <name> [fileOrUrl...]
 * CLIs: execFile(path, args) only — no shell.
 *
 * Moho special (2026-08-05 crashes ×3, same windowDidMove nil):
 *   open -a Moho <doc>  → AE open document
 *   open -a Moho        → applicationOpenUntitledFile / AE open event
 * Both hit WindowManagement tiling → SIGSEGV on Moho 14.3 + macOS 27.
 * FAIL-CLOSED: NEVER use open -a Moho. Design only via Pro CLI MohoScript.
 *   action=lua|scaffold|animate|preview|render|design
 */
function invoke(externalId, opts) {
  opts = opts || {};
  var action = opts.action || 'default';
  var args = Array.isArray(opts.args) ? opts.args : [];
  var timeout = opts.timeout_ms != null ? opts.timeout_ms : 8000;
  var dryRun = !!opts.dry_run;

  var resolved = resolveExternal(externalId);
  if (!resolved.ok) return resolved;

  if (resolved.kind === 'capability' || resolved.kind === 'modality_package') {
    return {
      ok: false,
      error: 'not_directly_invokable',
      kind: resolved.kind,
      note: 'scaffold a probe modality, or use app:/cli: externals'
    };
  }

  // --- Moho.app professional CLI (Lua MohoScript) ---
  var mohoCli = null;
  try {
    mohoCli = require('./moho_cli');
  } catch (_m) { /* */ }

  // Block ALL Launch Services opens for Moho (bare open also crashes untitled)
  if (mohoCli && resolved.kind === 'app' && mohoCli.isMohoExternal(resolved)) {
    var guiActions = {
      default: 1,
      open: 1,
      gui: 1,
      launch: 1,
      '': 1
    };
    if (guiActions[action] && !opts.force_gui) {
      return {
        ok: false,
        error: 'moho_gui_open_disabled',
        id: resolved.id,
        kind: 'app',
        action: action,
        law:
          'open -a Moho crashes (untitled AE + windowDidMove). Use action=design|animate|scaffold|lua.',
        densest: [
          'living_invoke app:Moho action=publish',
          'living_invoke app:Moho action=design',
          'living_invoke app:Moho action=animate',
          'living_invoke app:Moho action=scaffold'
        ],
        note:
          'Moho Pro CLI only (open -a crashes). publish → review_sot published/* SoT.'
      };
    }
  }

  if (
    mohoCli &&
    resolved.kind === 'app' &&
    mohoCli.isMohoExternal(resolved) &&
    (action === 'lua' ||
      action === 'cli' ||
      action === 'script' ||
      action === 'moho_script' ||
      action === 'render' ||
      action === 'scaffold' ||
      action === 'animate' ||
      action === 'preview' ||
      action === 'design' ||
      action === 'publish')
  ) {
    var scriptPath = null;
    var projectPath = null;
    args.map(String).forEach(function (a) {
      if (/\.lua$/i.test(a)) scriptPath = a;
      else if (/\.(moho|anme|mohoproj)$/i.test(a)) projectPath = a;
    });
    if (!scriptPath && opts.script) scriptPath = opts.script;
    if (!projectPath && opts.project) projectPath = opts.project;

    if (action === 'render') {
      var ren = mohoCli.runRender({
        project: projectPath,
        dry_run: dryRun,
        timeout_ms: timeout > 8000 ? timeout : 300000
      });
      ren.id = resolved.id;
      ren.action = action;
      return ren;
    }
    var rankingGuess =
      opts.ranking_root || path.resolve(__dirname, '../../legacy/legacy/html');
    try {
      var alt = path.resolve(__dirname, '../../../legacy/legacy/html');
      if (fs.existsSync(path.join(alt, 'vendor', 'moho'))) rankingGuess = alt;
    } catch (_a) { /* */ }

    if (action === 'scaffold') {
      var sc = mohoCli.ensureJWorkbookProject(rankingGuess, {
        dry_run: dryRun,
        force: !!opts.force,
        timeout_ms: timeout > 8000 ? timeout : 90000
      });
      sc.id = resolved.id;
      sc.action = action;
      return sc;
    }
    if (action === 'animate') {
      var an = mohoCli.animateJWorkbook(rankingGuess, {
        project: projectPath,
        dry_run: dryRun,
        timeout_ms: timeout > 8000 ? timeout : 120000
      });
      an.id = resolved.id;
      an.action = action;
      return an;
    }
    if (action === 'preview') {
      var pr = mohoCli.renderPreview(rankingGuess, {
        project: projectPath,
        dry_run: dryRun,
        timeout_ms: timeout > 8000 ? timeout : 180000
      });
      pr.id = resolved.id;
      pr.action = action;
      return pr;
    }
    if (action === 'design' || action === 'publish') {
      // Full anti-drift: Moho Pro animate → motion JSON + frame sequence → stamp
      var pub = mohoCli.publishToRankingUi(rankingGuess, {
        project: projectPath,
        dry_run: dryRun,
        force_scaffold: !!opts.force,
        render_timeout_ms: timeout > 8000 ? timeout : 300000
      });
      // optional draw pass for vector glyphs in .moho (after animate inside publish)
      if (!dryRun && pub.ok) {
        try {
          var drawScript = path.join(
            mohoCli.defaultScriptsDir(rankingGuess),
            'DrawAccentShapes.lua'
          );
          if (fs.existsSync(drawScript)) {
            pub.draw = mohoCli.runLua({
              script: drawScript,
              project: projectPath || pub.project || mohoCli.defaultProjectPath(rankingGuess),
              timeout_ms: 120000
            });
            // re-export motion after draw
            pub.motion2 = mohoCli.exportMotionTimeline(rankingGuess, {
              project: projectPath || pub.project
            });
          }
        } catch (_d) { /* */ }
      }
      pub.id = resolved.id;
      pub.action = action;
      return pub;
    }
    var run = mohoCli.runLua({
      script: scriptPath,
      project: projectPath,
      dry_run: dryRun,
      timeout_ms: timeout > 8000 ? timeout : 90000
    });
    run.id = resolved.id;
    run.action = action;
    return run;
  }

  if (resolved.kind === 'app') {
    // Moho must never reach open -a (blocked above unless force_gui)
    if (mohoCli && mohoCli.isMohoExternal(resolved) && !opts.force_gui) {
      return {
        ok: false,
        error: 'moho_gui_open_disabled',
        id: resolved.id,
        note: 'Use action=design|animate. force_gui=true overrides (unsafe).'
      };
    }
    var openBin = which('open');
    if (!openBin) return { ok: false, error: 'open_not_found' };
    var openFileArgs = args.map(String);
    var crashNote = null;
    if (mohoCli && mohoCli.isMohoExternal(resolved)) {
      var san = mohoCli.sanitizeOpenArgs(openFileArgs);
      openFileArgs = san.args;
      crashNote = san.note;
    }
    var openArgs = ['-a', resolved.name].concat(openFileArgs);
    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        kind: 'app',
        command: openBin,
        args: openArgs,
        id: resolved.id,
        note: crashNote || undefined
      };
    }
    try {
      execFileSync(openBin, openArgs, {
        timeout: timeout,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8'
      });
      return {
        ok: true,
        kind: 'app',
        action: action,
        id: resolved.id,
        name: resolved.name,
        did: 'open -a ' + resolved.name + (openFileArgs.length ? ' +docs' : ''),
        note: crashNote || undefined
      };
    } catch (e) {
      return {
        ok: false,
        kind: 'app',
        id: resolved.id,
        error: String(e && e.message || e)
      };
    }
  }

  if (resolved.kind === 'cli') {
    // Safety: only allowlisted CLIs, fixed argv array, no shell
    var cliArgs = args.map(String);
    // Optional stdin for pbcopy / filters (capped; never a shell pipe)
    var stdinText = null;
    if (opts.stdin != null) {
      stdinText = String(opts.stdin);
      if (stdinText.length > 64 * 1024) {
        stdinText = stdinText.slice(0, 64 * 1024);
      }
    }
    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        kind: 'cli',
        command: resolved.path,
        args: cliArgs,
        stdin_len: stdinText != null ? stdinText.length : 0,
        id: resolved.id
      };
    }
    try {
      var stdout = execFileSync(resolved.path, cliArgs, {
        timeout: timeout,
        maxBuffer: 256 * 1024,
        input: stdinText != null ? stdinText : undefined,
        stdio: stdinText != null ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8'
      });
      return {
        ok: true,
        kind: 'cli',
        action: action,
        id: resolved.id,
        name: resolved.name,
        path: resolved.path,
        stdout: String(stdout || '').slice(0, 4000),
        stdin_len: stdinText != null ? stdinText.length : 0,
        did: resolved.name + (cliArgs.length ? ' ' + cliArgs.join(' ') : '') +
          (stdinText != null ? ' <stdin:' + stdinText.length + '>' : '')
      };
    } catch (e) {
      return {
        ok: false,
        kind: 'cli',
        id: resolved.id,
        error: String(e && e.message || e),
        stderr: e && e.stderr ? String(e.stderr).slice(0, 1000) : undefined
      };
    }
  }

  return { ok: false, error: 'unsupported_kind', kind: resolved.kind };
}

module.exports = {
  CLI_CANDIDATES: CLI_CANDIDATES,
  listApps: listApps,
  listClis: listClis,
  listCapabilities: listCapabilities,
  exploreHost: exploreHost,
  resolveExternal: resolveExternal,
  invoke: invoke,
  which: which
};
