/**
 * P62 C1: session_tail + perf_loop_tail writers (extracted from runtime).
 */
'use strict';

var fs = require('fs');
var path = require('path');

function stripAt(t) {
  return String(t || '').replace(/- at:.*\n/g, '');
}

/**
 * Write store/pages/session_tail.md from recent Best history rows.
 */
function writeSessionTail(rootDir, hist) {
  var rows = (hist || []).slice(-12);
  var lines = [
    '# session_tail',
    '',
    '- law: last-K Best outcomes only (P2 anti-dump)',
    '- n: ' + rows.length,
    '',
    '## outcomes'
  ];
  rows.forEach(function (r) {
    // P73: full rankCycle row (best_top) or slim loop_state (best/j/help)
    var top = r.best_top || {};
    var id = top.id || r.best || r.child || '?';
    var did = String(
      top.did || (r.sample && r.sample.did) || r.did || '—'
    ).slice(0, 48);
    var helped =
      top.helped != null
        ? top.helped
        : r.help != null
          ? r.help
          : r.sample
            ? !!r.sample.did_help
            : null;
    var jNum =
      top.j != null
        ? top.j
        : r.j != null
          ? r.j
          : r.sample && r.sample.j != null
            ? r.sample.j
            : null;
    var j = jNum != null && isFinite(Number(jNum)) ? Number(jNum).toFixed(3) : '—';
    var h = helped === true ? 'Y' : helped === false ? 'N' : '?';
    var at = r.at ? String(r.at).slice(11, 19) : '—';
    if (id === '?' && j === '—' && !r.sample) return; // skip empty slim holes
    lines.push('- ' + at + ' ' + id + ' help=' + h + ' j=' + j + ' ' + did);
  });
  lines.push('', '[[roadmap_densest]] [[research_latest]] [[hop0_digest]]', '');
  var core = lines.join('\n');
  var p = path.join(rootDir, 'store', 'pages', 'session_tail.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  var prev = '';
  try {
    if (fs.existsSync(p)) prev = fs.readFileSync(p, 'utf8');
  } catch (_e) { /* */ }
  if (stripAt(prev).trim() === stripAt(core).trim()) {
    return { ok: true, wrote: false, n: rows.length };
  }
  var body = core.replace(
    '# session_tail\n\n',
    '# session_tail\n\n- at: ' + new Date().toISOString() + '\n'
  );
  fs.writeFileSync(p, body, 'utf8');
  return { ok: true, wrote: true, n: rows.length, path: p };
}

/**
 * Write store/pages/perf_loop_tail.md densest timings.
 * mutates loop.perf_history when loop provided.
 */
function writePerfLoopTail(rootDir, loop, timing, parentId, top) {
  loop = loop || {};
  if (!loop.perf_history) loop.perf_history = [];
  loop.perf_history.push({
    at: new Date().toISOString(),
    parent: parentId || 'host',
    best: top && top.id,
    timing: timing
  });
  if (loop.perf_history.length > 16) loop.perf_history = loop.perf_history.slice(-12);
  var rows = loop.perf_history.slice(-8);
  var lines = [
    '# perf_loop_tail',
    '',
    '- law: P10 loop-time densest (ms per stage); explore often dominates host',
    '- n: ' + rows.length,
    '- hw: ' + (process.arch || '?') + ' node=' + process.version,
    '',
    '## timings'
  ];
  rows.forEach(function (r) {
    var t = r.timing || {};
    var at = r.at ? String(r.at).slice(11, 19) : '—';
    lines.push(
      '- ' +
        at +
        ' ' +
        (r.parent || '?') +
        '/' +
        (r.best || '—') +
        (r.timing && r.timing.thorough ? ' thorough' : ' fast') +
        ' total=' +
        (t.total_ms != null ? t.total_ms : '?') +
        ' sense=' +
        (t.sense_ms != null ? t.sense_ms : '?') +
        ' sim=' +
        (t.sim_ms != null ? t.sim_ms : '?') +
        ' explore=' +
        (t.explore_ms != null ? t.explore_ms : '?') +
        ' best=' +
        (t.best_ms != null ? t.best_ms : '?')
    );
  });
  lines.push(
    '',
    '## open_accel',
    '- Exp6 hard (src/accel.js): SIMD scoreSync n≥8; workers geom n≥256; GPU n≥512',
    '- living scoreChildren: mapParallel chunked n≥64; sequential under mem_critical',
    '- related: hash-embed dense pages≥6 (ANE N/A in Node)',
    '- explore: apps 15s; CLIs 30s; caps 60s; no ensureWasm under critical',
    '- law: smarter≠faster · clearer≠optimal · speed≠everything',
    '- mem: free_gb<0.4 densify+trim; <0.2 skip apps+probes; <0.15 lean',
    '',
    '[[roadmap_densest]] [[quality_law]] [[perf_hardware]] [[hop0_digest]]',
    ''
  );
  var core = lines.join('\n');
  var p = path.join(rootDir, 'store', 'pages', 'perf_loop_tail.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  var prev = '';
  try {
    if (fs.existsSync(p)) prev = fs.readFileSync(p, 'utf8');
  } catch (_e) { /* */ }
  var coreBucket = core.replace(/total=(\d+)/g, function (_m, n) {
    var v = parseInt(n, 10);
    var b = v < 20 ? 10 : v < 50 ? 40 : v < 100 ? 80 : 120;
    return 'total~' + b;
  });
  var prevBucket = stripAt(prev).replace(/total=(\d+)/g, function (_m, n) {
    var v = parseInt(n, 10);
    var b = v < 20 ? 10 : v < 50 ? 40 : v < 100 ? 80 : 120;
    return 'total~' + b;
  });
  if (prevBucket.trim() === stripAt(coreBucket).trim()) {
    return { ok: true, wrote: false, n: rows.length };
  }
  var body = core.replace(
    '# perf_loop_tail\n\n',
    '# perf_loop_tail\n\n- at: ' + new Date().toISOString() + '\n'
  );
  fs.writeFileSync(p, body, 'utf8');
  return { ok: true, wrote: true, n: rows.length, path: p, timing: timing };
}

module.exports = {
  writeSessionTail: writeSessionTail,
  writePerfLoopTail: writePerfLoopTail
};
