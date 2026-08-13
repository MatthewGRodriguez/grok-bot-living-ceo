/**
 * jfactor_exp6_simd.js — WASM (+ SIMD helper) batch scorer + field Best kernel.
 * Inlined into JFactor_exp6.js by tools/splice_exp6_opts.js
 */
(function (global) {
  'use strict';

  // @@WASM_B64@@
  var WASM_B64 = '';

  function b64ToU8(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function scoreRowJs(methodId, x, y, xMax, yMax, scale) {
    var p = xMax == 0 ? 0 : Math.abs(yMax / xMax);
    var xVal = (Math.abs(x) * p) * 0.5;
    var yVal = Math.abs(y) * 0.5;
    var xNorm = yMax == 0 ? 0 : xVal / Math.abs(yMax);
    var yNorm = yMax == 0 ? 0 : yVal / Math.abs(yMax);
    var xConsuming = (x > 0 && xMax > 0) || (x < 0 && xMax < 0);
    var yConsuming = (y > 0 && yMax > 0) || (y < 0 && yMax < 0);
    var score;
    if (methodId === 0) {
      if (xConsuming === yConsuming) {
        score = xNorm + yNorm;
        if (!xConsuming) score += 1.0;
      } else score = -(xNorm + yNorm);
    } else if (methodId === 2) {
      score = xNorm + yNorm;
      if (!xConsuming && !yConsuming) score += 1.0;
    } else {
      if (xConsuming !== yConsuming) score = xNorm + yNorm;
      else {
        score = -(xNorm + yNorm);
        if (!xConsuming && !yConsuming) score += 1.0;
      }
    }
    if (scale > 0) {
      var t = Math.abs(score) / scale;
      return t / (1 + t);
    }
    return score;
  }

  var wasm = {
    ready: false,
    simd: false,
    exports: null,
    memory: null
  };

  function ensureWasm() {
    if (wasm.exports || !WASM_B64) return !!wasm.exports;
    try {
      var bytes = b64ToU8(WASM_B64);
      var mod = new WebAssembly.Module(bytes);
      var inst = new WebAssembly.Instance(mod, {});
      wasm.exports = inst.exports;
      wasm.memory = inst.exports.memory;
      wasm.ready = true;
      try {
        var tmp = new Float32Array(wasm.memory.buffer, 0, 4);
        tmp[0] = 1; tmp[1] = 1; tmp[2] = 1; tmp[3] = 1;
        var s = wasm.exports.simd_sum_f32(0, 4);
        wasm.simd = Math.abs(s - 4) < 1e-5;
      } catch (_e) { wasm.simd = false; }
    } catch (err) {
      console.warn('JFExp6SIMD WASM init failed', err && err.message);
      wasm.ready = false;
    }
    return !!wasm.exports;
  }

  function growMem(need) {
    var pages = wasm.memory.buffer.byteLength / 65536;
    var want = Math.ceil(need / 65536);
    if (want > pages) wasm.memory.grow(want - pages);
  }

  function scoreSyncJs(rows) {
    var n = rows.length;
    var out = new Float64Array(n);
    for (var j = 0; j < n; j++) {
      var r = rows[j];
      if (r.skip) out[j] = -Number.MAX_VALUE;
      else out[j] = scoreRowJs(r.methodId, r.x, r.y, r.xMax, r.yMax, r.scale || 0);
    }
    return out;
  }

  function scoreSyncWasm(rows) {
    if (!ensureWasm()) return scoreSyncJs(rows);
    var n = rows.length;
    var midB = n;
    var f64B = n * 8;
    var skipB = n;
    var outB = n * 8;
    // layout: mid | x | y | xMax | yMax | scale | skip | out
    var midPtr = 0;
    var xPtr = (midPtr + midB + 7) & ~7;
    var yPtr = xPtr + f64B;
    var xMaxPtr = yPtr + f64B;
    var yMaxPtr = xMaxPtr + f64B;
    var scalePtr = yMaxPtr + f64B;
    var skipPtr = scalePtr + f64B;
    var outPtr = (skipPtr + skipB + 7) & ~7;
    var need = outPtr + outB;
    growMem(need);
    var buf = wasm.memory.buffer;
    var mid = new Int8Array(buf, midPtr, n);
    var x = new Float64Array(buf, xPtr, n);
    var y = new Float64Array(buf, yPtr, n);
    var xMax = new Float64Array(buf, xMaxPtr, n);
    var yMax = new Float64Array(buf, yMaxPtr, n);
    var scale = new Float64Array(buf, scalePtr, n);
    var skip = new Uint8Array(buf, skipPtr, n);
    for (var i = 0; i < n; i++) {
      var r = rows[i];
      if (r.skip) { skip[i] = 1; mid[i] = 0; x[i] = y[i] = xMax[i] = yMax[i] = scale[i] = 0; continue; }
      skip[i] = 0;
      mid[i] = r.methodId;
      x[i] = r.x; y[i] = r.y; xMax[i] = r.xMax; yMax[i] = r.yMax; scale[i] = r.scale || 0;
    }
    wasm.exports.score_batch_soa(n, midPtr, xPtr, yPtr, xMaxPtr, yMaxPtr, scalePtr, skipPtr, outPtr);
    return new Float64Array(wasm.memory.buffer.slice(outPtr, outPtr + outB));
  }

  function scoreSync(rows) {
    if (rows.length >= 8 && ensureWasm()) return scoreSyncWasm(rows);
    return scoreSyncJs(rows);
  }

  /**
   * Best-all-pixels field kernel. layers*: Float32Array length n.
   * Returns { i, score, backend }.
   */
  function fieldBest(opts) {
    var n = opts.n | 0;
    var gw = opts.gw | 0;
    var step = +opts.step || 1;
    var stickyI = opts.stickyI == null ? -1 : (opts.stickyI | 0);
    var align = +opts.align || 0;
    var close = +opts.close || 0;
    var ex = +opts.ex || 0, ey = +opts.ey || 0;
    var px = +opts.px || 0, py = +opts.py || 0;
    var SC = opts.SC, TP = opts.TP, HT = opts.HT, SR = opts.SR;
    var CH = opts.CH, WK = opts.WK, EC = opts.EC, WD = opts.WD;

    if (ensureWasm() && SC && SC.length >= n) {
      var bytes = n * 4;
      var scPtr = 0;
      var tpPtr = scPtr + bytes;
      var htPtr = tpPtr + bytes;
      var srPtr = htPtr + bytes;
      var chPtr = srPtr + bytes;
      var wkPtr = chPtr + bytes;
      var ecPtr = wkPtr + bytes;
      var wdPtr = ecPtr + bytes;
      var outPtr = (wdPtr + bytes + 15) & ~7;
      growMem(outPtr + 16);
      var buf = wasm.memory.buffer;
      new Float32Array(buf, scPtr, n).set(SC.subarray(0, n));
      new Float32Array(buf, tpPtr, n).set(TP.subarray(0, n));
      new Float32Array(buf, htPtr, n).set(HT.subarray(0, n));
      new Float32Array(buf, srPtr, n).set(SR.subarray(0, n));
      new Float32Array(buf, chPtr, n).set(CH.subarray(0, n));
      new Float32Array(buf, wkPtr, n).set(WK.subarray(0, n));
      new Float32Array(buf, ecPtr, n).set(EC.subarray(0, n));
      new Float32Array(buf, wdPtr, n).set(WD.subarray(0, n));
      wasm.exports.field_best(
        n, gw, step,
        scPtr, tpPtr, htPtr, srPtr, chPtr, wkPtr, ecPtr, wdPtr,
        align, close, ex, ey, px, py, stickyI, outPtr
      );
      var bestI = new Int32Array(wasm.memory.buffer, outPtr, 1)[0];
      var bestS = new Float64Array(wasm.memory.buffer, outPtr + 8, 1)[0];
      return { i: bestI, score: bestS, backend: wasm.simd ? 'wasm-simd' : 'wasm' };
    }

    // JS fallback (same math as field best-all-pixels)
    var rawBest = -Infinity, rawI = -1, stickyRaw = -Infinity;
    for (var i = 0; i < n; i++) {
      var X = SC[i] * 2 + TP[i] * 1.2 + HT[i] * 0.5 + SR[i] * 0.6 +
        CH[i] * 1.1 + WK[i] * 0.9 + EC[i] * 1.3 + WD[i] * 0.8;
      var Y = SC[i] * 3 + HT[i] + TP[i] * 1.5 + SR[i] + CH[i] + WK[i] * 2;
      var sPix = X * 2.2 + Y * 0.01 - align * 3 - close * 2;
      var gx = i % gw;
      var gy = (i / gw) | 0;
      var cx = (gx + 0.5) * step;
      var cy = (gy + 0.5) * step;
      var dShip = Math.hypot(cx - ex, cy - ey);
      var dFoe = Math.hypot(cx - px, cy - py);
      sPix -= dShip * 0.018;
      sPix += Math.max(0, 180 - dFoe) * 0.01;
      sPix *= 0.55;
      if (i === stickyI) stickyRaw = sPix;
      if (sPix > rawBest) { rawBest = sPix; rawI = i; }
    }
    var bestPix = rawI, pixScore = rawBest;
    if (stickyI >= 0 && stickyRaw > -Infinity && stickyRaw + 2.5 >= rawBest - 0.8) {
      bestPix = stickyI;
      pixScore = stickyRaw + 2.5;
    }
    return { i: bestPix, score: pixScore, backend: 'js' };
  }

  ensureWasm();

  var api = {
    scoreSync: scoreSync,
    scoreSyncJs: scoreSyncJs,
    fieldBest: fieldBest,
    scoreRow: scoreRowJs,
    ready: true,
    get wasmReady() { return !!wasm.exports; },
    get simd() { return wasm.simd; },
    ensureWasm: ensureWasm
  };
  global.JFExp6SIMD = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
