/**
 * P42 A5: skill packages — crystallized procedures as densest files.
 * skills_index.md = hop0 catalog (ids only path).
 * store/pages/skills/<id>.md = JIT body (when / do / re-enter).
 * Law: MCP = connection · Skills = procedure; Grok loads package on intent.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var SKILLS_DIR = path.join('store', 'pages', 'skills');
var INDEX = path.join('store', 'pages', 'skills_index.md');

function skillsDir(rootDir) {
  return path.join(rootDir, SKILLS_DIR);
}

function skillId(child, didPrefix) {
  var c = String(child || 'x')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 40);
  var d = String(didPrefix || 'do')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 24);
  return c + '__' + d;
}

function packagePath(rootDir, id) {
  return path.join(skillsDir(rootDir), String(id).replace(/[^a-zA-Z0-9._-]+/g, '_') + '.md');
}

/**
 * P62: optional script path for skill package (Anthropic skill scripts analog).
 * store/pages/skills/scripts/<id>.js — never auto-exec; outer author / intentional.
 */
function scriptPath(rootDir, id) {
  var safe = String(id || '').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(skillsDir(rootDir), 'scripts', safe + '.js');
}

function hasScript(rootDir, id) {
  try {
    return fs.existsSync(scriptPath(rootDir, id));
  } catch (_e) {
    return false;
  }
}

function getScript(rootDir, id) {
  if (!id) return { ok: false, error: 'id required' };
  var p = scriptPath(rootDir, id);
  if (!fs.existsSync(p)) {
    return {
      ok: false,
      error: 'no_script',
      id: id,
      path: p,
      note: 'optional: author store/pages/skills/scripts/<id>.js · never auto-exec'
    };
  }
  var text = fs.readFileSync(p, 'utf8');
  return {
    ok: true,
    id: id,
    path: p,
    text: text,
    tok_est: Math.ceil(text.length / 4),
    law: 'script optional · intentional run · not MCP auto-probe'
  };
}

/**
 * P59 A5: densest when/do/re-enter by child (parent-local, not host-only).
 */
function densestWhen(skill, parent) {
  if (skill.when) return skill.when;
  var c = skill.child;
  if (c === 'research') {
    return 'forecast/open_next points research · improve living-core · densest findings page';
  }
  if (c === 'crystallize') {
    return 'hop0 digest / wiki densest · crystallize after research help';
  }
  if (c === 'data' || skill.did_prefix === 'ensure_store') {
    return 'data_debt · craft pages over cap · missing index · store hygiene';
  }
  if (c === 'pages') {
    return 'data layer Best · thrash pages · link_index / data_index';
  }
  if (c === 'calendar_layers') {
    return 'calendar_debt · stale densest map · never invent $';
  }
  if (String(c).indexOf('probe_') === 0) {
    return 'intentional probe · only when host goal needs app surface';
  }
  return 'parent=' + parent + ' goal needs densest ' + c + ' work';
}

function densestDo(skill) {
  if (skill.do) return skill.do;
  var c = skill.child;
  var pref = skill.did_prefix || 'work';
  if (c === 'research' && pref === 'wrote') {
    return 'Best research → wrote store/pages/research_latest.md densest (no mtime farm)';
  }
  if (c === 'crystallize' && pref === 'wrote') {
    return 'Best crystallize → wrote hop0_digest / wiki densest';
  }
  if (c === 'data' || pref === 'ensure_store') {
    return 'Best data → ensure_store + data_index · nested pages if debt';
  }
  if (c === 'pages') {
    return 'Best pages under data → trim thrash · rewrite data_index/link_index';
  }
  if (c === 'calendar_layers') {
    return 'Best calendar_layers → rewrite densest map (mtime debt) · sheet $ SoT';
  }
  return 'Best enters ' + c + ' → ' + pref;
}

function densestReenter(skill, id, parent) {
  if (skill.re_enter) return skill.re_enter;
  return (
    'living_sense modality=' +
    parent +
    ' · living_skill get id=' +
    id +
    ' · living_token_view action=handoff modality=' +
    parent +
    ' · [[skills_index]]'
  );
}

/**
 * Write/update one densest skill package. Returns { ok, id, wrote, path }.
 */
function writePackage(rootDir, skill, opts) {
  opts = opts || {};
  if (!skill || !skill.child) return { ok: false, error: 'child required' };
  var id = skill.id || skillId(skill.child, skill.did_prefix);
  var parent = skill.parent || opts.parent || 'host';
  var dir = skillsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  var p = packagePath(rootDir, id);
  var when = densestWhen(skill, parent);
  var doLine = densestDo(skill);
  var reEnter = densestReenter(skill, id, parent);
  var pageHint =
    skill.child === 'research'
      ? 'research_latest'
      : skill.child === 'crystallize'
        ? 'hop0_digest'
        : skill.child === 'calendar_layers'
          ? 'calendar_layers'
          : skill.child === 'data' || skill.child === 'pages'
            ? 'data_index'
            : 'operate_close';
  var body = [
    '# skill ' + skill.child + ' / ' + (skill.did_prefix || 'do'),
    '',
    '- id: ' + id,
    '- child: ' + skill.child,
    '- did_prefix: ' + (skill.did_prefix || '—'),
    '- n_help: ' + (skill.n_help != null ? skill.n_help : '—'),
    '- parent: ' + parent,
    '- page: [[' + pageHint + ']]',
    '- at: ' + new Date().toISOString(),
    '- law: crystallized procedure · load JIT · parent-local · not auto-probe install',
    '- pilot: P59 A5',
    '',
    '## when',
    when,
    '',
    '## do',
    doLine,
    skill.last_did
      ? '- last_did: `' + String(skill.last_did).slice(0, 80) + '`'
      : '',
    skill.last_j != null ? '- last_j: ' + Number(skill.last_j).toFixed(3) : '',
    '',
    '## re-enter',
    reEnter,
    '',
    '## forecast tip',
    'If hop0 forecast= skill:' +
      id +
      ' or page:' +
      pageHint +
      ' → load this package JIT (not full catalog).',
    '',
    '## script (optional)',
    hasScript(rootDir, id)
      ? '- path: `store/pages/skills/scripts/' +
        id +
        '.js` · living_skill action=script id=' +
        id +
        ' · intentional only'
      : '- none yet · author scripts/' + id + '.js if procedure needs code',
    '',
    '## do not',
    '- farm diary dumps or mtime thrash',
    '- invent roadmap phases without debt',
    '- auto-install probes (Grok outer author)',
    '- re-prefill tool schemas when handoff pack suffices',
    '- auto-exec skill scripts without outer author intent',
    '',
    '[[skills_index]] [[session_tail]] [[hop0_digest]] [[operate_close]] [[operate_handoff]]',
    ''
  ]
    .filter(function (line) {
      return line !== '';
    })
    .join('\n');

  // stable compare without - at:
  var strip = function (t) {
    return String(t || '').replace(/- at:.*\n/g, '');
  };
  var prev = '';
  try {
    if (fs.existsSync(p)) prev = fs.readFileSync(p, 'utf8');
  } catch (_e) { /* */ }
  if (strip(prev).trim() === strip(body).trim()) {
    return { ok: true, id: id, wrote: false, path: p };
  }
  fs.writeFileSync(p, body, 'utf8');
  return { ok: true, id: id, wrote: true, path: p };
}

/**
 * Write packages for a skill list; return densest id catalog.
 */
function writePackages(rootDir, skills, opts) {
  opts = opts || {};
  var written = [];
  var ids = [];
  (skills || []).forEach(function (s) {
    var r = writePackage(
      rootDir,
      {
        child: s.child,
        did_prefix: s.did_prefix,
        n_help: s.n_help,
        last_did: s.last_did,
        parent: opts.parent || 'host',
        id: skillId(s.child, s.did_prefix)
      },
      opts
    );
    if (r.ok) {
      ids.push(r.id);
      if (r.wrote) written.push(r.id);
    }
  });
  return { ok: true, ids: ids, written: written, n: ids.length };
}

/**
 * List skill package ids densest (from dir or index).
 */
function listPackages(rootDir) {
  var dir = skillsDir(rootDir);
  var ids = [];
  if (fs.existsSync(dir)) {
    try {
      fs.readdirSync(dir).forEach(function (f) {
        if (!/\.md$/i.test(f)) return;
        ids.push(f.replace(/\.md$/i, ''));
      });
    } catch (_e) { /* */ }
  }
  ids.sort();
  return { ok: true, n: ids.length, ids: ids, dir: dir };
}

/**
 * Load one skill package body for Grok (JIT).
 */
function getPackage(rootDir, id) {
  if (!id) return { ok: false, error: 'id required' };
  var p = packagePath(rootDir, id);
  if (!fs.existsSync(p)) {
    // try child__did form from "child/did"
    if (String(id).indexOf('/') >= 0) {
      var parts = String(id).split('/');
      p = packagePath(rootDir, skillId(parts[0], parts[1]));
    }
  }
  if (!fs.existsSync(p)) {
    return { ok: false, error: 'not_found', id: id, list: listPackages(rootDir).ids };
  }
  var text = fs.readFileSync(p, 'utf8');
  var sid = path.basename(p, '.md');
  var sp = hasScript(rootDir, sid) ? scriptPath(rootDir, sid) : null;
  return {
    ok: true,
    id: sid,
    path: p,
    text: text,
    densest: true,
    tok_est: Math.ceil(text.length / 4),
    script: sp
      ? { exists: true, path: sp, rel: 'store/pages/skills/scripts/' + sid + '.js' }
      : { exists: false }
  };
}

/**
 * Dispatch for MCP living_skill.
 */
/**
 * Densest one-liner catalog for hop0 / list (when + do first lines).
 */
function listDense(rootDir) {
  var listed = listPackages(rootDir);
  var dense = [];
  (listed.ids || []).forEach(function (id) {
    var g = getPackage(rootDir, id);
    if (!g.ok) return;
    var when = '';
    var doL = '';
    var lines = String(g.text || '').split('\n');
    var mode = null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (/^## when/i.test(ln)) {
        mode = 'when';
        continue;
      }
      if (/^## do/i.test(ln)) {
        mode = 'do';
        continue;
      }
      if (/^## /i.test(ln)) {
        mode = null;
        continue;
      }
      if (mode === 'when' && ln && !when) when = ln.slice(0, 72);
      if (mode === 'do' && ln && !doL && ln.indexOf('- last_') !== 0) doL = ln.slice(0, 72);
    }
    dense.push({
      id: id,
      when: when || null,
      do: doL || null,
      script: hasScript(rootDir, id)
    });
  });
  return {
    ok: true,
    n: dense.length,
    ids: listed.ids,
    dense: dense,
    law: 'skills_index = catalog · packages = JIT body · scripts optional · list dense = when/do',
    index: path.join(rootDir, INDEX),
    pilot: 'P62'
  };
}

function dispatch(rootDir, opts) {
  opts = opts || {};
  var action = String(opts.action || opts.op || 'list').toLowerCase();
  if (action === 'list' || action === 'ids' || action === 'status') {
    return listDense(rootDir);
  }
  if (action === 'get' || action === 'load' || action === 'read') {
    return getPackage(rootDir, opts.id || opts.skill || opts.name);
  }
  if (action === 'script' || action === 'get_script' || action === 'read_script') {
    return getScript(rootDir, opts.id || opts.skill || opts.name);
  }
  if (action === 'id') {
    return {
      ok: true,
      id: skillId(opts.child, opts.did_prefix || opts.did || 'do')
    };
  }
  return {
    ok: false,
    error: 'unknown_action',
    actions: ['list', 'get', 'script', 'id']
  };
}

module.exports = {
  skillId: skillId,
  writePackage: writePackage,
  writePackages: writePackages,
  listPackages: listPackages,
  listDense: listDense,
  getPackage: getPackage,
  getScript: getScript,
  hasScript: hasScript,
  scriptPath: scriptPath,
  dispatch: dispatch,
  densestWhen: densestWhen,
  densestDo: densestDo,
  skillsDir: skillsDir,
  packagePath: packagePath
};
