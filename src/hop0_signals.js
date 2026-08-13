/**
 * P60 C1 densest: hop0 signal builders extracted from runtime.
 * Pure-ish helpers — runtime still owns loop/registry state.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var accel = require('./accel');
var samples = require('./samples');

/**
 * Cheap host memory signal for hop0 mem=
 */
function hostMemSignal(loop) {
  loop = loop || {};
  try {
    var os = require('os');
    var freeGB = os.freemem() / (1024 * 1024 * 1024);
    var totalGB = os.totalmem() / (1024 * 1024 * 1024);
    var freeR = Math.round(freeGB * 100) / 100;
    var pressure =
      freeGB < 0.2 ? 'critical' : freeGB < 0.4 ? 'high' : freeGB < 1 ? 'med' : 'ok';
    return {
      free_gb: freeR,
      total_gb: Math.round(totalGB * 10) / 10,
      pressure: pressure,
      trim: loop.last_mem_trim || null,
      densify: !!(loop.last_timing && loop.last_timing.mem_pressure_densify),
      apps_skipped: !!(loop.last_timing && loop.last_timing.apps_skipped),
      probe_skip: !!loop.last_probe_skip,
      lean: !!(loop.lean || (loop.last_timing && loop.last_timing.lean))
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Loop preflight densest (repeat · gate · budget · tools).
 * opts: { loop, history, registry, densestSkills, rootDir }
 */
function densestLoopOk(opts) {
  opts = opts || {};
  var loop = opts.loop || {};
  var freeGB = null;
  try {
    freeGB = require('os').freemem() / (1024 * 1024 * 1024);
  } catch (_e) { /* */ }
  var skillsN = 0;
  try {
    if (loop.last_skills) skillsN = loop.last_skills.length;
    else if (typeof opts.densestSkills === 'function') {
      var sk = opts.densestSkills();
      skillsN = sk ? sk.length : 0;
    }
  } catch (_s) { /* */ }
  var histN = opts.history ? opts.history.length : 0;
  var samplesN = 0;
  try {
    if (opts.rootDir) samplesN = samples.readAll(opts.rootDir).length;
  } catch (_sa) { /* */ }
  var repeat = skillsN > 0 || samplesN >= 3 || histN >= 1;
  var gate = true;
  var budgetOk = freeGB == null || freeGB >= 0.2;
  var reg = opts.registry || {};
  var tools =
    Object.keys(reg).length >= 3 &&
    typeof require('./judge').judgeEnter === 'function';
  var notes = [];
  if (!repeat) notes.push('no_repeat_yet');
  if (!budgetOk) notes.push('budget_critical');
  if (!tools) notes.push('tools_thin');
  var ok = repeat && gate && tools;
  return {
    ok: ok,
    repeat: repeat,
    gate: gate,
    budget: budgetOk,
    tools: tools,
    free_gb: freeGB != null ? Math.round(freeGB * 100) / 100 : null,
    skills_n: skillsN,
    samples_n: samplesN,
    note: notes.length ? notes.join(',') : 'preflight_ok'
  };
}

/**
 * Accel probe densest for hop0.
 * opts: { loop }
 */
function densestAccel(opts) {
  opts = opts || {};
  var loop = opts.loop || {};
  try {
    var p = accel.probe({});
    var score = loop.last_score_accel || null;
    return {
      simd: !!(p.simd && (p.simd.ready || p.simd.simd)),
      simd_lane: !!(p.simd && p.simd.simd),
      workers: !!(p.workers && p.workers.ready),
      workers_n: p.workers && p.workers.size != null ? p.workers.size : 0,
      gpu: !!(p.gpu && p.gpu.available),
      score_backend: score && score.backend,
      score_n: score && score.n,
      related: loop.last_related_backend || null,
      mem_critical: !!p.mem_critical,
      thr:
        'simd≥' +
        accel.THRESH.simd_n +
        ' w≥' +
        accel.THRESH.worker_n +
        ' gpu≥' +
        accel.THRESH.gpu_n
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Read last capture row from captures_tail.md (SoT for hop0 display).
 */
function readCapturesTailLast(rootDir) {
  var p = path.join(rootDir, 'store', 'pages', 'captures_tail.md');
  if (!fs.existsSync(p)) return null;
  try {
    var lines = fs.readFileSync(p, 'utf8').split('\n');
    for (var i = lines.length - 1; i >= 0; i--) {
      // P74: ISO at or legacy HH:MM:SS
      var m = lines[i].match(/^\s*-\s+(\S+)\s+(\S+)\s+(.+)$/);
      if (m && m[2] !== 'law:' && m[3] && m[1] !== 'law:' && m[1] !== 'n:') {
        return { at: m[1], kind: m[2], text: m[3].slice(0, 80) };
      }
    }
  } catch (_e) { /* */ }
  return null;
}

/**
 * Last capture densest: prefer captures_tail SoT over stale loop_state.
 * P73 polish: loop.last_capture alone can lag across MCP reload.
 */
function densestLastCapture(rootDir, loop) {
  loop = loop || {};
  var fromTail = readCapturesTailLast(rootDir);
  if (fromTail && fromTail.text) return fromTail;
  if (loop.last_capture && loop.last_capture.text) return loop.last_capture;
  return null;
}

/**
 * Normalize one history / history_tail row to densest session cell.
 * Accepts full rankCycle rows (best_top) or slim loop_state (best/j/help).
 */
function sessionRowFromHistory(r) {
  r = r || {};
  var top = r.best_top || {};
  var child =
    top.id ||
    r.best ||
    r.child ||
    (r.sample && r.sample.child) ||
    '—';
  var helped =
    top.helped != null
      ? !!top.helped
      : r.help != null
        ? !!r.help
        : r.sample
          ? !!r.sample.did_help
          : r.judge
            ? !!r.judge.did_help
            : null;
  var j =
    top.j != null
      ? top.j
      : r.j != null
        ? r.j
        : r.sample && r.sample.j != null
          ? r.sample.j
          : null;
  return { child: child, help: helped, j: j };
}

/**
 * Session densest last-K from history or session_tail.md
 * P73: slim history_tail from loop_state must not yield session=—/N
 */
function densestSession(rootDir, history) {
  if (history && history.length) {
    var mapped = history.slice(-3).map(sessionRowFromHistory);
    // if all empty placeholders, fall through to session_tail SoT
    var any =
      mapped.some(function (x) {
        return x.child && x.child !== '—' && x.child !== '?';
      }) ||
      mapped.some(function (x) {
        return x.j != null;
      });
    if (any) return mapped;
  }
  var p = path.join(rootDir, 'store', 'pages', 'session_tail.md');
  if (!fs.existsSync(p)) return null;
  try {
    var text = fs.readFileSync(p, 'utf8');
    var out = [];
    var re = /^\s*-\s+\S+\s+(\S+)\s+help=([YN?])\s+j=([0-9.]+|—)/gm;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m[1] === '?' || m[1] === '—') continue;
      out.push({
        child: m[1],
        help: m[2] === 'Y',
        j: m[3] === '—' ? null : parseFloat(m[3])
      });
    }
    return out.length ? out.slice(-3) : null;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  hostMemSignal: hostMemSignal,
  densestLoopOk: densestLoopOk,
  densestAccel: densestAccel,
  densestLastCapture: densestLastCapture,
  densestSession: densestSession,
  sessionRowFromHistory: sessionRowFromHistory,
  readCapturesTailLast: readCapturesTailLast
};
