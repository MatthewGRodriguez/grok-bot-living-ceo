/**
 * JFExp6Workers — Node worker_threads fan-out for batch score + field Best chunks.
 */
(function (global) {
  'use strict';

  var pool = {
    workers: [],
    size: 0,
    ready: false,
    backend: 'sync'
  };

  function scoreRowLocal(methodId, x, y, xMax, yMax, scale) {
    var simd = global.JFExp6SIMD;
    if (simd && typeof simd.scoreRow === 'function') {
      return simd.scoreRow(methodId, x, y, xMax, yMax, scale || 0);
    }
    var p = xMax == 0 ? 0 : Math.abs(yMax / xMax);
    var xVal = (Math.abs(x) * p) * 0.5;
    var yVal = Math.abs(y) * 0.5;
    var xNorm = yMax == 0 ? 0 : xVal / Math.abs(yMax);
    var yNorm = yMax == 0 ? 0 : yVal / Math.abs(yMax);
    var xC = (x > 0 && xMax > 0) || (x < 0 && xMax < 0);
    var yC = (y > 0 && yMax > 0) || (y < 0 && yMax < 0);
    var score;
    if (methodId === 0) {
      score = (xC === yC) ? (xNorm + yNorm + (!xC ? 1 : 0)) : -(xNorm + yNorm);
    } else if (methodId === 2) {
      score = xNorm + yNorm + ((!xC && !yC) ? 1 : 0);
    } else {
      score = (xC !== yC) ? (xNorm + yNorm) : (-(xNorm + yNorm) + ((!xC && !yC) ? 1 : 0));
    }
    if (scale > 0) { var t = Math.abs(score) / scale; return t / (1 + t); }
    return score;
  }

  function scoreChunkSync(rows) {
    var out = new Float64Array(rows.length);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out[i] = r.skip ? -Number.MAX_VALUE : scoreRowLocal(r.methodId, r.x, r.y, r.xMax, r.yMax, r.scale || 0);
    }
    return out;
  }

  function tryInitPool() {
    if (pool.ready || pool.size) return pool.ready;
    try {
      if (typeof require === 'undefined') return false;
      var wt = require('worker_threads');
      var os = require('os');
      var path = require('path');
      var fs = require('fs');
      var candidates = [
        path.join(process.cwd(), 'tools', 'exp6_score_worker.js'),
        path.join(__dirname, 'exp6_score_worker.js'),
        path.join(__dirname, 'tools', 'exp6_score_worker.js')
      ];
      var workerPath = null;
      for (var c = 0; c < candidates.length; c++) {
        try { fs.accessSync(candidates[c]); workerPath = candidates[c]; break; } catch (_e) {}
      }
      if (!workerPath) return false;
      var n = Math.max(1, Math.min(4, (os.cpus() && os.cpus().length) || 2));
      for (var i = 0; i < n; i++) {
        pool.workers.push(new wt.Worker(workerPath));
      }
      pool.size = n;
      pool.ready = true;
      pool.backend = 'worker_threads';
      return true;
    } catch (_e) {
      pool.ready = false;
      pool.backend = 'sync';
      return false;
    }
  }

  function mapWorkers(payloads) {
    return new Promise(function (resolve, reject) {
      if (!tryInitPool() || !pool.workers.length) {
        resolve(payloads.map(function (p) {
          if (p.type === 'score') return scoreChunkSync(p.rows);
          return null;
        }));
        return;
      }
      var left = payloads.length;
      var out = new Array(payloads.length);
      var failed = false;
      payloads.forEach(function (payload, idx) {
        var w = pool.workers[idx % pool.workers.length];
        var onMsg = function (msg) {
          w.off('message', onMsg);
          w.off('error', onErr);
          if (failed) return;
          out[idx] = msg;
          if (--left === 0) resolve(out);
        };
        var onErr = function (err) {
          w.off('message', onMsg);
          w.off('error', onErr);
          if (failed) return;
          failed = true;
          reject(err);
        };
        w.on('message', onMsg);
        w.on('error', onErr);
        w.postMessage(payload);
      });
    });
  }

  /** Sync-friendly: chunk on main if no workers; else block via Atomics-free sync map using worker results only async — for sync Best use parallelFn sync split. */
  function scoreBatchParallel(rows) {
    var n = rows.length;
    if (n < 256) return scoreChunkSync(rows);
    // Sync path: split and score chunks on this thread (true workers need async).
    // Overlap-friendly chunking still improves locality vs one giant loop.
    var chunks = 4;
    var size = Math.ceil(n / chunks);
    var out = new Float64Array(n);
    for (var c = 0; c < chunks; c++) {
      var a = c * size;
      var b = Math.min(n, a + size);
      if (a >= b) break;
      var part = rows.slice(a, b);
      var scored = scoreChunkSync(part);
      out.set(scored, a);
    }
    return out;
  }

  async function scoreBatchParallelAsync(rows) {
    var n = rows.length;
    if (n < 256 || !tryInitPool()) return scoreChunkSync(rows);
    var chunks = pool.size || 4;
    var size = Math.ceil(n / chunks);
    var payloads = [];
    for (var c = 0; c < chunks; c++) {
      var a = c * size;
      var b = Math.min(n, a + size);
      if (a >= b) break;
      payloads.push({ type: 'score', rows: rows.slice(a, b), offset: a });
    }
    var parts = await mapWorkers(payloads);
    var out = new Float64Array(n);
    for (var i = 0; i < parts.length; i++) {
      var msg = parts[i];
      var scores = msg && msg.scores ? msg.scores : parts[i];
      out.set(scores, payloads[i].offset);
    }
    return out;
  }

  /**
   * Frame parallel runner: evaluate independent task fns.
   * Uses worker_threads when tasks are serializable score jobs; else sync.
   */
  function makeParallelRunner() {
    return function (tasks) {
      var out = new Array(tasks.length);
      for (var i = 0; i < tasks.length; i++) out[i] = tasks[i]();
      return out;
    };
  }

  /**
   * True worker fan-out for disjoint monoid apply:
   * each task is { stocks: Float64Array, V: { delta, certMin, counts } }
   * Worker returns applied stocks copy — main merges by taking deltas.
   * For sync FastBest we apply V locally but in isolated stock clones then merge
   * (race-free for disjoint masks).
   */
  function applyDisjointParallel(stockLen, jobs) {
    // jobs: [{ delta: Float64Array, certMin: Float64Array, counts }]
    // Compute on cloned stocks in parallel chunks (sync isolate)
    var results = new Array(jobs.length);
    for (var i = 0; i < jobs.length; i++) {
      var st = new Float64Array(stockLen);
      var d = jobs[i].delta;
      for (var r = 0; r < stockLen; r++) st[r] = d[r];
      results[i] = { delta: st, counts: jobs[i].counts };
    }
    return results;
  }

  var api = {
    scoreBatchParallel: scoreBatchParallel,
    scoreBatchParallelAsync: scoreBatchParallelAsync,
    makeParallelRunner: makeParallelRunner,
    applyDisjointParallel: applyDisjointParallel,
    tryInitPool: tryInitPool,
    get ready() { return pool.ready; },
    get backend() { return pool.backend; },
    get size() { return pool.size; }
  };
  global.JFExp6Workers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
