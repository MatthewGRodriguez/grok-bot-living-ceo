/**
 * P12/P63 C1: densest perf surface (extracted from runtime).
 * Read-only; prefer after rankCycle so last_timing is set.
 */
'use strict';

var surface = require('./surface');
var accel = require('./accel');
var binaryBoundary = require('./binary_boundary');

function livingPerf(rootDir, loop, opts) {
  opts = opts || {};
  loop = loop || {};
  var historyN = opts.history_n != null ? Number(opts.history_n) : 6;
  if (!isFinite(historyN) || historyN < 1) historyN = 6;
  if (historyN > 16) historyN = 16;
  var freeGB = null;
  var totalGB = null;
  var ncpu = 0;
  try {
    var os = require('os');
    freeGB = Math.round((os.freemem() / (1024 * 1024 * 1024)) * 100) / 100;
    totalGB = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
    ncpu = os.cpus() ? os.cpus().length : 0;
  } catch (_o) { /* */ }
  var caps = [];
  try {
    var allCaps = surface.listCapabilities ? surface.listCapabilities() : [];
    caps = (allCaps || [])
      .filter(function (c) {
        var id = c && c.id ? String(c.id) : '';
        return id.indexOf('hw:') === 0 || id.indexOf('accel:') === 0;
      })
      .map(function (c) {
        return {
          id: c.id,
          available: c.available !== false,
          note: c.note || null
        };
      });
  } catch (_c) {
    caps = [
      {
        id: 'hw:cpu',
        available: ncpu > 0,
        note: 'n=' + ncpu + ' arch=' + process.arch
      },
      {
        id: 'hw:mem',
        available: true,
        note:
          'total_gb=' +
          totalGB +
          ' free_gb=' +
          freeGB +
          (freeGB != null && freeGB < 0.5 ? ' · pressure=high' : '')
      },
      {
        id: 'accel:wasm',
        available: typeof WebAssembly !== 'undefined',
        note: 'Exp6 kernels when ensureWasm'
      }
    ];
  }
  var hist = (loop.perf_history || []).slice(-historyN).map(function (r) {
    var t = r.timing || {};
    return {
      at: r.at,
      parent: r.parent,
      best: r.best,
      thorough: !!t.thorough,
      total_ms: t.total_ms,
      sense_ms: t.sense_ms,
      sim_ms: t.sim_ms,
      explore_ms: t.explore_ms,
      densify_ms: t.densify_ms,
      best_ms: t.best_ms,
      mem_pressure_densify: !!t.mem_pressure_densify,
      free_gb: t.free_gb != null ? t.free_gb : null
    };
  });
  var last = loop.last_timing || null;
  var accelProbe = null;
  var accelBench = null;
  try {
    accelProbe = accel.probe({ force: !!opts.force_probe });
    if (opts.bench) {
      accelBench = accel.bench({
        n: opts.bench_n != null ? opts.bench_n : 128,
        force: !!opts.force_bench
      });
    }
  } catch (_ab) { /* */ }
  return {
    ok: true,
    law: 'P12/P20 densest perf — hop0 perf=/accel=; hard SIMD/workers/GPU when n large',
    last_timing: last,
    history: hist,
    score_accel: loop.last_score_accel || null,
    accel: accelProbe,
    bench: accelBench,
    hw: {
      arch: process.arch,
      platform: process.platform,
      node: process.version,
      ncpu: ncpu,
      total_gb: totalGB,
      free_gb: freeGB,
      mem_pressure: freeGB != null && freeGB < 0.4
    },
    caps: caps,
    hop0_perf:
      last && last.total_ms != null
        ? 'perf=total=' +
          last.total_ms +
          ' explore=' +
          (last.explore_ms != null ? last.explore_ms : '?') +
          ' sim=' +
          (last.sim_ms != null ? last.sim_ms : '?') +
          ' best=' +
          (last.best_ms != null ? last.best_ms : '?') +
          (last.thorough ? ' thorough' : ' fast')
        : null,
    binary_boundary: (function () {
      try {
        return binaryBoundary.status(rootDir, {
          force_probe: !!opts.force_probe
        });
      } catch (_bb) {
        return null;
      }
    })(),
    note: last
      ? 'last_timing from rankCycle; re-enter hop0 has perf= + binary= lines'
      : 'no rankCycle yet this process — run living_rank_cycle first'
  };
}

module.exports = {
  livingPerf: livingPerf
};
