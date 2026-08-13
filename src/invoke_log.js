/**
 * Durable intentional-invoke log (P7/P8).
 * Separate from rank effectiveness_samples.jsonl.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var FILE = 'invoke_samples.jsonl';
var MAX = 120;

function logPath(rootDir) {
  return path.join(rootDir, 'store', 'pages', FILE);
}

function record(rootDir, row) {
  var dir = path.join(rootDir, 'store', 'pages');
  fs.mkdirSync(dir, { recursive: true });
  var r = {
    at: row.at || new Date().toISOString(),
    id: row.id || row.external_id || null,
    ok: row.ok !== false,
    action: row.action || null,
    did: row.did || null,
    kind: row.kind || null
  };
  if (!r.id) return { ok: false, error: 'id required' };
  fs.appendFileSync(logPath(rootDir), JSON.stringify(r) + '\n', 'utf8');
  var all = readAll(rootDir);
  if (all.length > MAX) {
    var keep = all.slice(-Math.floor(MAX * 0.75));
    fs.writeFileSync(
      logPath(rootDir),
      keep.map(function (x) { return JSON.stringify(x); }).join('\n') + '\n',
      'utf8'
    );
  }
  return { ok: true, sample: r };
}

function readAll(rootDir) {
  var p = logPath(rootDir);
  if (!fs.existsSync(p)) return [];
  var out = [];
  try {
    fs.readFileSync(p, 'utf8').split('\n').forEach(function (line) {
      line = line.trim();
      if (!line) return;
      try {
        out.push(JSON.parse(line));
      } catch (_e) { /* */ }
    });
  } catch (_e2) {
    return [];
  }
  return out;
}

/**
 * Count successful invokes for an external id (exact or app:Name match).
 */
function statsForExternal(rootDir, externalId) {
  var id = String(externalId || '');
  var all = readAll(rootDir).filter(function (r) {
    if (!r || !r.id) return false;
    if (r.id === id) return true;
    // app:Inkscape matches probe external
    if (id.indexOf('app:') === 0 && r.id === id) return true;
    if (id.indexOf('cli:') === 0 && r.id === id) return true;
    return false;
  });
  var okN = all.filter(function (r) { return r.ok; }).length;
  var recent = all.slice(-8);
  var okRecent = recent.filter(function (r) { return r.ok; }).length;
  return {
    n: all.length,
    ok_n: okN,
    ok_recent: okRecent,
    last: all.length ? all[all.length - 1] : null
  };
}

/**
 * Recent invoke rows for hop0/prompt (P41 TOON pack).
 */
function listRecent(rootDir, n) {
  n = n || 12;
  return readAll(rootDir).slice(-n);
}

/**
 * Slim rows for LLM TOON boundary (disk JSONL unchanged).
 */
function slimForPrompt(rows) {
  return (rows || []).map(function (r) {
    return {
      at: r.at || '',
      id: r.id || '',
      ok: r.ok === false ? 0 : 1,
      kind: r.kind || '',
      action: r.action ? String(r.action).slice(0, 40) : '',
      did: r.did ? String(r.did).slice(0, 48) : ''
    };
  });
}

module.exports = {
  record: record,
  readAll: readAll,
  listRecent: listRecent,
  slimForPrompt: slimForPrompt,
  statsForExternal: statsForExternal,
  logPath: logPath
};
