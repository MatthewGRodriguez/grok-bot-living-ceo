/**
 * P7/P68 C1: intentional invoke densest log + surface invoke (extracted).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var surface = require('./surface');
var invokeLog = require('./invoke_log');

function writeInvokeTail(rootDir, rows) {
  var list = (rows || []).slice(-12);
  var lines = [
    '# invoke_tail',
    '',
    '- law: P7 intentional Mac tool use only (not rank Best)',
    '- n: ' + list.length,
    '',
    '## invokes'
  ];
  list.forEach(function (r) {
    var at = r.at ? String(r.at).slice(11, 19) : '—';
    var ok = r.ok === false ? 'N' : 'Y';
    var id = r.id || r.external_id || '?';
    var did = String(r.did || r.action || '—').slice(0, 56);
    lines.push('- ' + at + ' ' + id + ' ok=' + ok + ' ' + did);
  });
  lines.push('', '[[session_tail]] [[roadmap_densest]] [[skills_index]]', '');
  var core = lines.join('\n');
  var p = path.join(rootDir, 'store', 'pages', 'invoke_tail.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  var prev = '';
  try {
    if (fs.existsSync(p)) prev = fs.readFileSync(p, 'utf8');
  } catch (_e) { /* */ }
  var strip = function (t) {
    return String(t || '').replace(/- at:.*\n/g, '');
  };
  if (strip(prev).trim() === strip(core).trim()) {
    return { ok: true, wrote: false, n: list.length };
  }
  var body = core.replace(
    '# invoke_tail\n\n',
    '# invoke_tail\n\n- at: ' + new Date().toISOString() + '\n'
  );
  fs.writeFileSync(p, body, 'utf8');
  return { ok: true, wrote: true, n: list.length, path: p };
}

/**
 * Invoke external; record densest on loop when not dry_run.
 * Mutates loop.invoke_history · last_invoke.
 */
function invoke(rootDir, loop, opts) {
  opts = opts || {};
  loop = loop || {};
  var externalId = opts.external_id || opts.externalId;
  var result = surface.invoke(externalId, {
    action: opts.action,
    args: opts.args,
    timeout_ms: opts.timeout_ms,
    dry_run: opts.dry_run,
    stdin: opts.stdin
  });
  if (!opts.dry_run && result) {
    if (!loop.invoke_history) loop.invoke_history = [];
    var row = {
      at: new Date().toISOString(),
      id: result.id || externalId,
      ok: result.ok !== false,
      action: opts.action || result.action || null,
      did: result.did || result.error || null,
      kind: result.kind || null
    };
    loop.invoke_history.push(row);
    if (loop.invoke_history.length > 24) {
      loop.invoke_history = loop.invoke_history.slice(-16);
    }
    loop.last_invoke = {
      id: row.id,
      ok: row.ok,
      action: row.action,
      did: row.did
    };
    try {
      result.invoke_tail = writeInvokeTail(rootDir, loop.invoke_history);
    } catch (_it) { /* */ }
    try {
      invokeLog.record(rootDir, row);
    } catch (_il) { /* */ }
  }
  return result;
}

function resolveExternal(rootDir, externalId) {
  return surface.resolveExternal(externalId, rootDir);
}

module.exports = {
  writeInvokeTail: writeInvokeTail,
  invoke: invoke,
  resolveExternal: resolveExternal
};
