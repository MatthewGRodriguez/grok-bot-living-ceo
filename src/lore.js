/**
 * P29 — densest Lore VCS adapter (Epic open-source, binary-first, centralized).
 *
 * CLI-first glue for living-core. Does not auto-install lore/loreserver.
 * Demo defaults: lore://127.0.0.1:41337  health http://127.0.0.1:41339/health_check
 *
 * Flow densest: health → create|status → dirty/stage(--scan) → commit → push
 * Offline: stage+commit local; push needs server.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var http = require('http');

var DEFAULT_REMOTE = 'lore://127.0.0.1:41337';
var DEFAULT_HEALTH = 'http://127.0.0.1:41339/health_check';
var DEFAULT_REPO_NAME = 'living-core';

var LOREIGNORE_BODY = [
  '# living-core densest .loreignore (P29)',
  '# outbound: never stage thrash / caches / incidental git',
  '.git/',
  '.grok/',
  'node_modules/',
  '.DS_Store',
  '*.log',
  'store/samples/',
  'store/pages/page_z_*.md',
  'store/raw/**',
  '!store/raw/README.md',
  'vendor/exp6/tools/*.wasm',
  '.lore/',
  ''
].join('\n');

function findBin() {
  var candidates = [
    process.env.LORE_BIN,
    path.join(process.env.HOME || '', '.local', 'bin', 'lore'),
    '/usr/local/bin/lore',
    '/opt/homebrew/bin/lore'
  ].filter(Boolean);
  for (var i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(candidates[i]) && fs.statSync(candidates[i]).isFile()) {
        return candidates[i];
      }
    } catch (_e) { /* */ }
  }
  try {
    var which = cp.execFileSync('which', ['lore'], {
      encoding: 'utf8',
      timeout: 2000
    }).trim();
    if (which) return which;
  } catch (_e2) { /* */ }
  return null;
}

function runLore(args, opts) {
  opts = opts || {};
  var bin = opts.bin || findBin();
  if (!bin) {
    return {
      ok: false,
      error: 'lore_not_found',
      note: 'install: curl -fsSL …/EpicGames/lore/…/install.sh | bash -s -- --demo'
    };
  }
  var cwd = opts.cwd || process.cwd();
  var timeout = opts.timeout_ms != null ? opts.timeout_ms : 120000;
  try {
    var out = cp.execFileSync(bin, args, {
      cwd: cwd,
      encoding: 'utf8',
      timeout: timeout,
      maxBuffer: 8 * 1024 * 1024,
      env: Object.assign({}, process.env, {
        PATH: path.dirname(bin) + path.delimiter + (process.env.PATH || '')
      })
    });
    return { ok: true, code: 0, stdout: String(out || ''), stderr: '', bin: bin };
  } catch (e) {
    var stdout = e && e.stdout != null ? String(e.stdout) : '';
    var stderr = e && e.stderr != null ? String(e.stderr) : '';
    var msg = (stderr || stdout || (e && e.message) || 'lore_failed').trim();
    return {
      ok: false,
      code: e && e.status != null ? e.status : 1,
      stdout: stdout,
      stderr: stderr,
      error: msg.slice(0, 800),
      bin: bin
    };
  }
}

function health(opts) {
  opts = opts || {};
  var url = opts.url || process.env.LORE_HEALTH || DEFAULT_HEALTH;
  return new Promise(function (resolve) {
    var done = false;
    var finish = function (r) {
      if (done) return;
      done = true;
      resolve(r);
    };
    try {
      var u = new URL(url);
      var req = http.request(
        {
          hostname: u.hostname,
          port: u.port || 41339,
          path: u.pathname || '/health_check',
          method: 'GET',
          timeout: opts.timeout_ms || 2500
        },
        function (res) {
          res.resume();
          finish({
            ok: res.statusCode === 200,
            status: res.statusCode,
            url: url
          });
        }
      );
      req.on('error', function (err) {
        finish({ ok: false, error: String(err && err.message || err), url: url });
      });
      req.on('timeout', function () {
        req.destroy();
        finish({ ok: false, error: 'health_timeout', url: url });
      });
      req.end();
    } catch (e) {
      finish({ ok: false, error: String(e && e.message || e), url: url });
    }
  });
}

function healthSync(opts) {
  opts = opts || {};
  var url = opts.url || process.env.LORE_HEALTH || DEFAULT_HEALTH;
  try {
    var u = new URL(url);
    var r = cp.execFileSync(
      'curl',
      ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '2', url],
      { encoding: 'utf8', timeout: 3000 }
    );
    var code = parseInt(String(r).trim(), 10);
    return {
      ok: code === 200,
      status: code,
      url: url,
      host: u.hostname,
      port: u.port || '41339'
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e), url: url };
  }
}

function hasWorkspace(rootDir) {
  try {
    return fs.existsSync(path.join(rootDir, '.lore'));
  } catch (_e) {
    return false;
  }
}

function ensureIgnore(rootDir) {
  var p = path.join(rootDir, '.loreignore');
  if (fs.existsSync(p)) {
    return { ok: true, path: p, wrote: false };
  }
  fs.writeFileSync(p, LOREIGNORE_BODY, 'utf8');
  return { ok: true, path: p, wrote: true };
}

function parseStatus(text) {
  text = String(text || '');
  var out = {
    repo_id: null,
    branch: null,
    revision: null,
    rev_hash: null,
    remote_revision: null,
    sync: null,
    staged_n: 0,
    dirty_n: 0,
    ahead: false,
    lines: text.split('\n').filter(Boolean).slice(0, 40)
  };
  var m;
  m = text.match(/Repository\s+([0-9a-fA-F]+)/);
  if (m) out.repo_id = m[1].slice(0, 16);
  m = text.match(/On branch\s+(\S+)\s+revision\s+(\d+)\s*->\s*([0-9a-fA-F.]+)/i);
  if (m) {
    out.branch = m[1];
    out.revision = parseInt(m[2], 10);
    out.rev_hash = m[3].replace(/\./g, '').slice(0, 12);
  }
  m = text.match(/Remote revision\s+(\d+)\s*->\s*([0-9a-fA-F.]+)/i);
  if (m) {
    out.remote_revision = parseInt(m[1], 10);
  }
  if (/in sync with remote/i.test(text)) out.sync = 'in_sync';
  else if (/ahead of remote/i.test(text)) {
    out.sync = 'ahead';
    out.ahead = true;
  } else if (/behind/i.test(text)) out.sync = 'behind';
  else if (/Local branch/i.test(text)) out.sync = 'local';

  var staged = text.match(/Changes staged for commit:([\s\S]*?)(?:\n\n|\n[A-Z]|\nLocal|\nRemote|$)/i);
  if (staged) {
    out.staged_n = (staged[1].match(/^\s*[AMD]\s+\S+/gm) || []).length;
  }
  // dirty lines often like "M path" under unstaged / dirty sections
  var dirtyLines = text.match(/^\s*[AMD]\s+\S+/gm) || [];
  out.dirty_n = dirtyLines.length;
  return out;
}

function status(rootDir, opts) {
  opts = opts || {};
  if (!hasWorkspace(rootDir)) {
    return {
      ok: false,
      error: 'no_workspace',
      has_workspace: false,
      bin: findBin(),
      health: healthSync(),
      note: 'run living_lore init / lore repository create'
    };
  }
  var args = ['status'];
  if (opts.scan) args.push('--scan');
  if (opts.revision_only) args.push('--revision-only');
  var r = runLore(args, { cwd: rootDir, timeout_ms: opts.timeout_ms || 60000 });
  var parsed = parseStatus(r.stdout || r.error || '');
  return {
    ok: r.ok,
    has_workspace: true,
    bin: r.bin || findBin(),
    health: opts.skip_health ? null : healthSync(),
    parsed: parsed,
    stdout: (r.stdout || '').slice(0, 4000),
    error: r.ok ? null : r.error
  };
}

function create(rootDir, opts) {
  opts = opts || {};
  if (hasWorkspace(rootDir)) {
    return {
      ok: true,
      already: true,
      has_workspace: true,
      note: 'workspace exists (.lore/)',
      status: status(rootDir, { revision_only: true, skip_health: true })
    };
  }
  var h = healthSync();
  if (!h.ok) {
    return {
      ok: false,
      error: 'server_unhealthy',
      health: h,
      note: 'start loreserver (install.sh --demo) or check :41339/health_check'
    };
  }
  ensureIgnore(rootDir);
  var name = opts.name || DEFAULT_REPO_NAME;
  var remote = opts.remote || process.env.LORE_REMOTE || DEFAULT_REMOTE;
  var url = opts.url || remote.replace(/\/$/, '') + '/' + name;
  var args = ['repository', 'create', url];
  if (opts.identity) {
    args = ['--identity', opts.identity].concat(args);
  }
  var r = runLore(args, { cwd: rootDir, timeout_ms: opts.timeout_ms || 120000 });
  return {
    ok: r.ok && hasWorkspace(rootDir),
    url: url,
    name: name,
    has_workspace: hasWorkspace(rootDir),
    health: h,
    stdout: (r.stdout || '').slice(0, 2000),
    error: r.ok ? null : r.error,
    ignore: path.join(rootDir, '.loreignore')
  };
}

function stage(rootDir, opts) {
  opts = opts || {};
  if (!hasWorkspace(rootDir)) {
    return { ok: false, error: 'no_workspace' };
  }
  var paths = opts.paths;
  if (!paths || !paths.length) paths = ['.'];
  if (typeof paths === 'string') paths = [paths];
  var args = ['stage'];
  if (opts.scan !== false) args.push('--scan');
  args = args.concat(paths);
  var r = runLore(args, { cwd: rootDir, timeout_ms: opts.timeout_ms || 180000 });
  return {
    ok: r.ok,
    paths: paths,
    scan: opts.scan !== false,
    stdout: (r.stdout || '').slice(0, 2000),
    error: r.ok ? null : r.error
  };
}

function commit(rootDir, opts) {
  opts = opts || {};
  if (!hasWorkspace(rootDir)) {
    return { ok: false, error: 'no_workspace' };
  }
  var msg = String(opts.message || opts.msg || 'living-core densest').slice(0, 200);
  var r = runLore(['commit', msg], {
    cwd: rootDir,
    timeout_ms: opts.timeout_ms || 180000
  });
  var rev = null;
  var sig = null;
  var m = (r.stdout || '').match(/Revision\s*:\s*(\d+)/i);
  if (m) rev = parseInt(m[1], 10);
  m = (r.stdout || '').match(/Signature\s*:\s*([0-9a-fA-F.]+)/i);
  if (m) sig = m[1].replace(/\./g, '').slice(0, 12);
  return {
    ok: r.ok,
    message: msg,
    revision: rev,
    signature: sig,
    stdout: (r.stdout || '').slice(0, 2000),
    error: r.ok ? null : r.error
  };
}

function push(rootDir, opts) {
  opts = opts || {};
  if (!hasWorkspace(rootDir)) {
    return { ok: false, error: 'no_workspace' };
  }
  var h = healthSync();
  if (!h.ok) {
    return { ok: false, error: 'server_unhealthy', health: h };
  }
  var r = runLore(['push'], { cwd: rootDir, timeout_ms: opts.timeout_ms || 180000 });
  return {
    ok: r.ok,
    health: h,
    stdout: (r.stdout || '').slice(0, 2000),
    error: r.ok ? null : r.error
  };
}

function sync(rootDir, opts) {
  opts = opts || {};
  if (!hasWorkspace(rootDir)) {
    return { ok: false, error: 'no_workspace' };
  }
  var h = healthSync();
  if (!h.ok) {
    return { ok: false, error: 'server_unhealthy', health: h };
  }
  var r = runLore(['sync'], { cwd: rootDir, timeout_ms: opts.timeout_ms || 180000 });
  return {
    ok: r.ok,
    health: h,
    stdout: (r.stdout || '').slice(0, 2000),
    error: r.ok ? null : r.error
  };
}

/**
 * Densest submit: ensure ignore → stage(--scan) → commit → push.
 * Offline-capable until push (push fails cleanly if server down).
 */
function submit(rootDir, opts) {
  opts = opts || {};
  if (!hasWorkspace(rootDir)) {
    var created = create(rootDir, opts);
    if (!created.ok) {
      return { ok: false, step: 'create', create: created, error: created.error };
    }
  }
  ensureIgnore(rootDir);
  var st0 = stage(rootDir, {
    paths: opts.paths,
    scan: opts.scan !== false,
    timeout_ms: opts.timeout_ms
  });
  if (!st0.ok) {
    return { ok: false, step: 'stage', stage: st0, error: st0.error };
  }
  var c = commit(rootDir, {
    message: opts.message || opts.msg || 'living-core densest submit',
    timeout_ms: opts.timeout_ms
  });
  if (!c.ok) {
    // empty stage is common "nothing to commit" — still ok-ish
    var empty =
      /nothing|no change|no staged|empty/i.test(c.error || '') ||
      /nothing|no change|no staged|empty/i.test(c.stdout || '');
    if (!empty) {
      return { ok: false, step: 'commit', stage: st0, commit: c, error: c.error };
    }
  }
  var p = null;
  if (opts.push !== false) {
    p = push(rootDir, { timeout_ms: opts.timeout_ms });
    if (!p.ok) {
      return {
        ok: false,
        step: 'push',
        stage: st0,
        commit: c,
        push: p,
        error: p.error,
        note: 'local commit may exist; retry push when server healthy'
      };
    }
  }
  var st = status(rootDir, { revision_only: true });
  return {
    ok: true,
    step: 'done',
    stage: st0,
    commit: c,
    push: p,
    status: st,
    densest: densestSignalFromStatus(st)
  };
}

function densestSignalFromStatus(st) {
  if (!st || !st.ok) {
    var bin = findBin();
    var h = healthSync();
    return {
      present: !!bin,
      workspace: !!(st && st.has_workspace),
      server: !!(h && h.ok),
      branch: null,
      rev: null,
      sync: null,
      text:
        (bin ? 'lore' : 'no_lore') +
        (h && h.ok ? ' srv=Y' : ' srv=N') +
        (!st || !st.has_workspace ? ' ws=N' : ' ws=?')
    };
  }
  var p = st.parsed || {};
  var text =
    (p.branch || '—') +
    ' r' +
    (p.revision != null ? p.revision : '?') +
    (p.rev_hash ? '@' + p.rev_hash.slice(0, 8) : '') +
    (p.sync ? ' ' + p.sync : '') +
    (p.staged_n ? ' staged=' + p.staged_n : '');
  return {
    present: true,
    workspace: true,
    server: !!(st.health && st.health.ok),
    branch: p.branch,
    rev: p.revision,
    rev_hash: p.rev_hash,
    sync: p.sync,
    staged_n: p.staged_n,
    text: text
  };
}

/** Cheap hop0 densest last_lore= signal (no full scan). */
function densestSignal(rootDir) {
  var bin = findBin();
  var h = healthSync();
  if (!bin) {
    return {
      present: false,
      workspace: false,
      server: !!(h && h.ok),
      text: 'no_lore' + (h && h.ok ? ' srv=Y' : ' srv=N')
    };
  }
  if (!hasWorkspace(rootDir)) {
    return {
      present: true,
      workspace: false,
      server: !!(h && h.ok),
      text: 'lore ws=N' + (h && h.ok ? ' srv=Y' : ' srv=N')
    };
  }
  var r = runLore(['status', '--revision-only'], {
    cwd: rootDir,
    timeout_ms: 15000
  });
  var parsed = parseStatus(r.stdout || '');
  var text =
    (parsed.branch || 'main') +
    ' r' +
    (parsed.revision != null ? parsed.revision : '?') +
    (parsed.rev_hash ? '@' + parsed.rev_hash.slice(0, 8) : '') +
    (parsed.sync ? ' ' + parsed.sync : r.ok ? '' : ' err') +
    (h && h.ok ? '' : ' srv=N');
  return {
    present: true,
    workspace: true,
    server: !!(h && h.ok),
    branch: parsed.branch,
    rev: parsed.revision,
    rev_hash: parsed.rev_hash,
    sync: parsed.sync,
    text: text,
    ok: r.ok
  };
}

function info(rootDir) {
  return {
    ok: true,
    bin: findBin(),
    has_workspace: hasWorkspace(rootDir),
    health: healthSync(),
    remote_default: DEFAULT_REMOTE,
    health_default: DEFAULT_HEALTH,
    densest: densestSignal(rootDir)
  };
}

module.exports = {
  findBin: findBin,
  runLore: runLore,
  health: health,
  healthSync: healthSync,
  hasWorkspace: hasWorkspace,
  ensureIgnore: ensureIgnore,
  parseStatus: parseStatus,
  status: status,
  create: create,
  stage: stage,
  commit: commit,
  push: push,
  sync: sync,
  submit: submit,
  densestSignal: densestSignal,
  densestSignalFromStatus: densestSignalFromStatus,
  info: info,
  DEFAULT_REMOTE: DEFAULT_REMOTE,
  DEFAULT_HEALTH: DEFAULT_HEALTH,
  DEFAULT_REPO_NAME: DEFAULT_REPO_NAME
};
