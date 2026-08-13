/**
 * Hard accel densest — Exp6 SIMD / workers / GPU + living score fan-out.
 * Law: wire the hard path; use only when n (or free_gb) makes it densest help.
 * Under mem critical: never ensureWasm / spawn workers / GPU.
 */
'use strict';

var path = require('path');
var os = require('os');

var THRESH = {
  simd_n: 8, // Exp6 scoreSync wasm path
  worker_n: 64, // living parallel jmethod chunks (softer than Exp6 256 for jgroup)
  exp6_worker_n: 256, // Exp6 geometric batch workers
  gpu_n: 512,
  related_dense_pages: 6 // use hash-embed related when enough pages
};

var _probeCache = { at: 0, result: null };
var PROBE_MS = 30000;

function freeGb() {
  try {
    return os.freemem() / (1024 * 1024 * 1024);
  } catch (_e) {
    return null;
  }
}

function memCritical() {
  var f = freeGb();
  return f != null && f < 0.2;
}

function memLean() {
  var f = freeGb();
  return f != null && f < 0.15;
}

/**
 * Probe accel backends (cached). Safe under mem pressure (no wasm load).
 */
function probe(opts) {
  opts = opts || {};
  var now = Date.now();
  if (
    !opts.force &&
    _probeCache.result &&
    now - _probeCache.at < PROBE_MS
  ) {
    return Object.assign({}, _probeCache.result, {
      free_gb: freeGb(),
      mem_critical: memCritical()
    });
  }

  var critical = memCritical();
  var out = {
    ok: true,
    thresholds: Object.assign({}, THRESH),
    free_gb: freeGb(),
    mem_critical: critical,
    mem_lean: memLean(),
    simd: { available: false, ready: false, simd: false, note: null },
    workers: { available: false, ready: false, size: 0, backend: 'none', note: null },
    gpu: { available: false, ready: false, note: null },
    related: { backend: 'token_overlap', dense: false, note: 'hash-embed when pages≥' + THRESH.related_dense_pages },
    ane: {
      available: false,
      note: 'ANE not in Node; densest substitute = local hash-embed related (not neural)'
    }
  };

  // SIMD / WASM
  try {
    var simdMod = require(path.join(__dirname, '..', 'vendor', 'exp6', 'jfactor_exp6_simd.js'));
    out.simd.available = !!simdMod;
    if (simdMod && !critical && !opts.skip_wasm) {
      if (typeof simdMod.ensureWasm === 'function') simdMod.ensureWasm();
      out.simd.ready = !!(simdMod.ready || simdMod.wasmReady || (simdMod.ensureWasm && simdMod.ensureWasm()));
      out.simd.simd = !!simdMod.simd;
      out.simd.note = out.simd.simd
        ? 'WASM SIMD scoreSync/fieldBest'
        : out.simd.ready
          ? 'WASM ready (scalar path)'
          : 'ensureWasm failed';
    } else if (critical) {
      out.simd.note = 'skipped ensureWasm under mem_critical';
    } else {
      out.simd.note = 'module present; wasm not loaded';
    }
  } catch (e) {
    out.simd.note = 'load_error:' + (e && e.message ? e.message.slice(0, 40) : 'err');
  }

  // Workers
  try {
    require(path.join(__dirname, '..', 'vendor', 'exp6', 'JFactor_exp6.js'));
    var W = globalThis.JFExp6Workers;
    out.workers.available = !!W;
    if (W && !critical && typeof W.tryInitPool === 'function') {
      var ok = W.tryInitPool();
      out.workers.ready = !!(ok || W.ready);
      out.workers.size = W.size || 0;
      out.workers.backend = W.backend || (out.workers.ready ? 'worker_threads' : 'sync');
      out.workers.note = out.workers.ready
        ? 'pool size=' + out.workers.size
        : 'pool not started (sync fallback)';
    } else if (critical) {
      out.workers.note = 'skipped workers under mem_critical';
    } else {
      out.workers.note = 'JFExp6Workers present';
    }
  } catch (e2) {
    out.workers.note = 'load_error:' + (e2 && e2.message ? e2.message.slice(0, 40) : 'err');
  }

  // GPU (probe only — heavy under mem)
  try {
    var gpuMod = require(path.join(__dirname, '..', 'vendor', 'exp6', 'jfactor_exp6_gpu.js'));
    out.gpu.available =
      !!gpuMod && process.platform === 'darwin' && process.arch === 'arm64';
    if (gpuMod && !critical && opts.warm_gpu && typeof gpuMod.init === 'function') {
      try {
        gpuMod.init();
        out.gpu.ready = !!gpuMod.ready;
      } catch (_g) {
        out.gpu.ready = false;
      }
    }
    out.gpu.note = out.gpu.available
      ? critical
        ? 'Metal path available; skipped under mem_critical'
        : out.gpu.ready
          ? 'GPU ready'
          : 'Metal candidate (init on warm_gpu / large n)'
      : 'not apple silicon / no module';
  } catch (e3) {
    out.gpu.note = 'load_error';
  }

  _probeCache = { at: now, result: out };
  return out;
}

/**
 * Score Exp6-style geometric rows with densest backend for n.
 * rows: [{ methodId, x, y, xMax, yMax, scale?, skip? }, ...]
 * @returns {{ scores: Float64Array, backend: string, n: number, ms: number }}
 */
function scoreBatch(rows, opts) {
  opts = opts || {};
  rows = rows || [];
  var n = rows.length;
  var t0 = Date.now();
  var critical = memCritical();
  var backend = 'js';
  var scores = null;

  if (!n) {
    return { scores: new Float64Array(0), backend: 'empty', n: 0, ms: 0 };
  }

  // Prefer GPU only for huge n and not critical
  if (
    !critical &&
    n >= THRESH.gpu_n &&
    !opts.force_simd &&
    !opts.force_js
  ) {
    try {
      var gpu = require(path.join(__dirname, '..', 'vendor', 'exp6', 'jfactor_exp6_gpu.js'));
      if (gpu && typeof gpu.scoreSync === 'function') {
        if (typeof gpu.init === 'function') {
          try {
            gpu.init();
          } catch (_i) { /* */ }
        }
        scores = gpu.scoreSync(rows);
        backend = 'gpu';
      }
    } catch (_g) { /* fall through */ }
  }

  // Workers for Exp6 geometric batches
  if (
    !scores &&
    !critical &&
    n >= THRESH.exp6_worker_n &&
    !opts.force_simd &&
    !opts.force_js
  ) {
    try {
      require(path.join(__dirname, '..', 'vendor', 'exp6', 'JFactor_exp6.js'));
      var W = globalThis.JFExp6Workers;
      if (W && typeof W.scoreBatchParallel === 'function') {
        scores = W.scoreBatchParallel(rows);
        backend = 'workers';
      }
    } catch (_w) { /* */ }
  }

  // SIMD / WASM
  if (!scores && !critical && n >= THRESH.simd_n && !opts.force_js) {
    try {
      var simd = require(path.join(__dirname, '..', 'vendor', 'exp6', 'jfactor_exp6_simd.js'));
      if (simd && typeof simd.scoreSync === 'function') {
        if (typeof simd.ensureWasm === 'function') simd.ensureWasm();
        scores = simd.scoreSync(rows);
        backend = simd.simd ? 'simd' : 'wasm';
      }
    } catch (_s) { /* */ }
  }

  // JS fallback (always available)
  if (!scores) {
    try {
      var simdJs = require(path.join(__dirname, '..', 'vendor', 'exp6', 'jfactor_exp6_simd.js'));
      if (simdJs && typeof simdJs.scoreSyncJs === 'function') {
        scores = simdJs.scoreSyncJs(rows);
        backend = 'js';
      }
    } catch (_j) { /* */ }
  }
  if (!scores) {
    scores = new Float64Array(n);
    for (var i = 0; i < n; i++) scores[i] = 0;
    backend = 'zero';
  }

  return {
    scores: scores,
    backend: backend,
    n: n,
    ms: Date.now() - t0,
    mem_critical: critical
  };
}

/**
 * Parallel map for independent score tasks (living jmethods).
 * Uses sync chunk fan-out on main when n large; no worker spawn under mem_critical.
 * fn(item, index) → number or object
 */
function mapParallel(items, fn, opts) {
  opts = opts || {};
  items = items || [];
  var n = items.length;
  var t0 = Date.now();
  var critical = memCritical();
  var thr = opts.threshold != null ? opts.threshold : THRESH.worker_n;
  var out = new Array(n);
  var backend = 'sequential';

  if (n < thr || critical || opts.force_seq) {
    for (var i = 0; i < n; i++) out[i] = fn(items[i], i);
    backend = critical ? 'sequential_mem' : 'sequential';
  } else {
    // Chunked sequential with better locality (true workers need serializable jmethods —
    // living lambdas close over FS; densest honest path = chunked main-thread).
    // Optional: interleave for better cache when n large.
    var chunks = Math.min(4, Math.max(2, Math.floor(n / 8)));
    var size = Math.ceil(n / chunks);
    for (var c = 0; c < chunks; c++) {
      var a = c * size;
      var b = Math.min(n, a + size);
      for (var j = a; j < b; j++) out[j] = fn(items[j], j);
    }
    backend = 'chunked_x' + chunks;
  }

  return {
    results: out,
    backend: backend,
    n: n,
    ms: Date.now() - t0
  };
}

/**
 * Dense local relatedness embedding (ANE substitute).
 * Char 3-gram hashed into dim floats — no network, no ANE.
 */
function embedText(text, dim) {
  dim = dim || 48;
  var v = new Float32Array(dim);
  var s = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\[\]\s]+/g, ' ')
    .slice(0, 8000);
  if (s.length < 3) return v;
  for (var i = 0; i < s.length - 2; i++) {
    var g = s.charCodeAt(i) * 73856093 + s.charCodeAt(i + 1) * 19349663 + s.charCodeAt(i + 2) * 83492791;
    var h = (g >>> 0) % dim;
    v[h] += 1;
  }
  // L2 normalize
  var norm = 0;
  for (var k = 0; k < dim; k++) norm += v[k] * v[k];
  norm = Math.sqrt(norm) || 1;
  for (var k2 = 0; k2 < dim; k2++) v[k2] /= norm;
  return v;
}

function cosine(a, b) {
  var n = Math.min(a.length, b.length);
  var s = 0;
  for (var i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/**
 * Synthetic Exp6-style rows for hard-path proof / living_perf bench.
 */
function syntheticRows(n) {
  n = n || 64;
  var rows = [];
  for (var i = 0; i < n; i++) {
    rows.push({
      methodId: i % 3,
      x: (i % 17) - 8,
      y: (i % 13) - 6,
      xMax: 10,
      yMax: 10,
      scale: 0,
      skip: false
    });
  }
  return rows;
}

/**
 * Bench all backends densest (skips heavy under critical unless force).
 */
function bench(opts) {
  opts = opts || {};
  var critical = memCritical();
  var n = opts.n != null ? opts.n : 128;
  var rows = syntheticRows(n);
  var results = [];
  var p = probe({ force: !!opts.force_probe, skip_wasm: critical && !opts.force });

  // JS
  try {
    var simd = require(path.join(__dirname, '..', 'vendor', 'exp6', 'jfactor_exp6_simd.js'));
    var t0 = Date.now();
    var js = simd.scoreSyncJs(rows);
    results.push({ backend: 'js', n: n, ms: Date.now() - t0, sum: sumF(js) });
  } catch (_j) {
    results.push({ backend: 'js', error: 'fail' });
  }

  if (!critical || opts.force) {
    try {
      var t1 = Date.now();
      var r = scoreBatch(rows, { force_simd: true });
      results.push({
        backend: r.backend,
        n: r.n,
        ms: r.ms,
        sum: sumF(r.scores)
      });
    } catch (_s) {
      results.push({ backend: 'simd', error: 'fail' });
    }
  } else {
    results.push({ backend: 'simd', skipped: 'mem_critical' });
  }

  return {
    ok: true,
    free_gb: freeGb(),
    mem_critical: critical,
    probe: {
      simd: p.simd,
      workers: p.workers,
      gpu: p.gpu,
      ane: p.ane
    },
    thresholds: THRESH,
    results: results
  };
}

function sumF(arr) {
  var s = 0;
  if (!arr) return 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return Math.round(s * 1000) / 1000;
}

module.exports = {
  THRESH: THRESH,
  probe: probe,
  scoreBatch: scoreBatch,
  mapParallel: mapParallel,
  embedText: embedText,
  cosine: cosine,
  syntheticRows: syntheticRows,
  bench: bench,
  freeGb: freeGb,
  memCritical: memCritical
};
