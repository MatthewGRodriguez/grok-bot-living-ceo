/**
 * jfactor_exp6_gpu.js — WebGPU batch scorer + async field Best for Exp6.
 */
(function (global) {
  'use strict';

  var METHOD_DIRECT = 0;
  var METHOD_INDIRECT = 1;
  var METHOD_NEUTRAL = 2;

  function scoreRow(row) {
    if (row.skip) return -Number.MAX_VALUE;
    var x = row.x, y = row.y, xMax = row.xMax, yMax = row.yMax;
    var methodId = row.methodId, scale = row.scale;
    var p = xMax == 0 ? 0 : Math.abs(yMax / xMax);
    var xVal = (Math.abs(x) * p) * 0.5;
    var yVal = Math.abs(y) * 0.5;
    var xNorm = yMax == 0 ? 0 : xVal / Math.abs(yMax);
    var yNorm = yMax == 0 ? 0 : yVal / Math.abs(yMax);
    var xConsuming = (x > 0 && xMax > 0) || (x < 0 && xMax < 0);
    var yConsuming = (y > 0 && yMax > 0) || (y < 0 && yMax < 0);
    var score;
    if (methodId === METHOD_DIRECT) {
      if (xConsuming === yConsuming) {
        score = xNorm + yNorm;
        if (!xConsuming) score += 1.0;
      } else score = -(xNorm + yNorm);
    } else if (methodId === METHOD_NEUTRAL) {
      score = xNorm + yNorm;
      if (!xConsuming && !yConsuming) score += 1.0;
    } else {
      if (xConsuming !== yConsuming) score = xNorm + yNorm;
      else {
        score = -(xNorm + yNorm);
        if (!xConsuming && !yConsuming) score += 1.0;
      }
    }
    if (scale != null && scale > 0) {
      var t = Math.abs(score) / scale;
      return t / (1 + t);
    }
    return score;
  }

  function scoreCpu(rows) {
    var out = new Float32Array(rows.length);
    for (var i = 0; i < rows.length; i++) out[i] = scoreRow(rows[i]);
    return out;
  }

  var gpuState = {
    device: null,
    pipeline: null,
    fieldPipeline: null,
    ready: false,
    cacheKey: '',
    cacheScores: null,
    pending: null
  };

  var WGSL = [
    'struct Row {',
    '  methodId: f32, x: f32, y: f32, xMax: f32, yMax: f32, scale: f32, skip: f32, _pad: f32,',
    '};',
    '@group(0) @binding(0) var<storage, read> rows: array<Row>;',
    '@group(0) @binding(1) var<storage, read_write> scores: array<f32>;',
    '@compute @workgroup_size(64)',
    'fn main(@builtin(global_invocation_id) gid: vec3<u32>) {',
    '  let i = gid.x;',
    '  if (i >= arrayLength(&rows)) { return; }',
    '  let r = rows[i];',
    '  if (r.skip > 0.5) { scores[i] = -3.402823e38; return; }',
    '  let x = r.x; let y = r.y; let xMax = r.xMax; let yMax = r.yMax;',
    '  var p = 0.0;',
    '  if (xMax != 0.0) { p = abs(yMax / xMax); }',
    '  let xVal = (abs(x) * p) * 0.5;',
    '  let yVal = abs(y) * 0.5;',
    '  var xNorm = 0.0; var yNorm = 0.0;',
    '  if (yMax != 0.0) { xNorm = xVal / abs(yMax); yNorm = yVal / abs(yMax); }',
    '  let xConsuming = select(0.0, 1.0, (x > 0.0 && xMax > 0.0) || (x < 0.0 && xMax < 0.0));',
    '  let yConsuming = select(0.0, 1.0, (y > 0.0 && yMax > 0.0) || (y < 0.0 && yMax < 0.0));',
    '  var score = 0.0;',
    '  let mid = i32(r.methodId);',
    '  if (mid == 0) {',
    '    if (xConsuming == yConsuming) { score = xNorm + yNorm; if (xConsuming < 0.5) { score = score + 1.0; } }',
    '    else { score = -(xNorm + yNorm); }',
    '  } else if (mid == 2) {',
    '    score = xNorm + yNorm;',
    '    if (xConsuming < 0.5 && yConsuming < 0.5) { score = score + 1.0; }',
    '  } else {',
    '    if (xConsuming != yConsuming) { score = xNorm + yNorm; }',
    '    else { score = -(xNorm + yNorm); if (xConsuming < 0.5 && yConsuming < 0.5) { score = score + 1.0; } }',
    '  }',
    '  if (r.scale > 0.0) { let t = abs(score) / r.scale; score = t / (1.0 + t); }',
    '  scores[i] = score;',
    '}'
  ].join('\n');

  function rowsKey(rows) {
    var n = rows.length;
    var h = n * 2654435761;
    var step = Math.max(1, (n / 32) | 0);
    for (var i = 0; i < n; i += step) {
      var r = rows[i];
      if (!r || r.skip) { h = (h + 1) | 0; continue; }
      h = (h + ((r.methodId + 1) * 17)) | 0;
      h = (h + ((r.x * 1000) | 0) + ((r.y * 1000) | 0)) | 0;
      h = (h + ((r.xMax * 10) | 0) + ((r.yMax * 10) | 0)) | 0;
    }
    return n + ':' + (h >>> 0);
  }

  async function init() {
    if (!global.navigator || !navigator.gpu) {
      gpuState.ready = false;
      return false;
    }
    try {
      var adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      var device = await adapter.requestDevice();
      var module = device.createShaderModule({ code: WGSL });
      var pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: module, entryPoint: 'main' }
      });
      gpuState.device = device;
      gpuState.pipeline = pipeline;
      gpuState.ready = true;
      return true;
    } catch (err) {
      console.warn('JFExp6GPU.init failed', err);
      gpuState.ready = false;
      return false;
    }
  }

  async function scoreGpuAsync(rows) {
    if (!gpuState.ready || !gpuState.device) return scoreCpu(rows);
    var device = gpuState.device;
    var n = rows.length;
    var stride = 8;
    var rowData = new Float32Array(n * stride);
    for (var i = 0; i < n; i++) {
      var r = rows[i];
      var o = i * stride;
      if (r.skip) { rowData[o + 6] = 1; continue; }
      rowData[o] = r.methodId;
      rowData[o + 1] = r.x; rowData[o + 2] = r.y;
      rowData[o + 3] = r.xMax; rowData[o + 4] = r.yMax;
      rowData[o + 5] = r.scale || 0;
    }
    var rowBuf = device.createBuffer({
      size: rowData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(rowBuf, 0, rowData);
    var scoreBuf = device.createBuffer({
      size: n * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    var readBuf = device.createBuffer({
      size: n * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    var bind = device.createBindGroup({
      layout: gpuState.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: rowBuf } },
        { binding: 1, resource: { buffer: scoreBuf } }
      ]
    });
    var enc = device.createCommandEncoder();
    var pass = enc.beginComputePass();
    pass.setPipeline(gpuState.pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(n / 64));
    pass.end();
    enc.copyBufferToBuffer(scoreBuf, 0, readBuf, 0, n * 4);
    device.queue.submit([enc.finish()]);
    await readBuf.mapAsync(GPUMapMode.READ);
    var copy = new Float32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    rowBuf.destroy(); scoreBuf.destroy(); readBuf.destroy();
    return copy;
  }

  /** Kick async GPU score; cache for next sync Best if fingerprint matches. */
  function warmScoreAsync(rows) {
    if (!gpuState.ready || rows.length < 64) return;
    var key = rowsKey(rows);
    if (gpuState.pending === key) return;
    gpuState.pending = key;
    scoreGpuAsync(rows).then(function (scores) {
      gpuState.cacheKey = key;
      gpuState.cacheScores = scores;
      if (gpuState.pending === key) gpuState.pending = null;
    }).catch(function () {
      if (gpuState.pending === key) gpuState.pending = null;
    });
  }

  /**
   * Sync scorer for FastBest: use GPU cache when warm + matching fingerprint,
   * else CPU. Always schedules a GPU warm for the next call when eligible.
   */
  function scoreSync(rows) {
    var key = rowsKey(rows);
    if (gpuState.ready && gpuState.cacheScores && gpuState.cacheKey === key &&
        gpuState.cacheScores.length === rows.length) {
      warmScoreAsync(rows);
      return gpuState.cacheScores;
    }
    warmScoreAsync(rows);
    return scoreCpu(rows);
  }

  var api = {
    get ready() { return gpuState.ready; },
    init: init,
    scoreSync: scoreSync,
    scoreGpuAsync: scoreGpuAsync,
    scoreCpu: scoreCpu,
    warmScoreAsync: warmScoreAsync,
    rowsKey: rowsKey
  };

  global.JFExp6GPU = api;
  if (typeof navigator !== 'undefined' && navigator.gpu && typeof api.init === 'function') {
    api.init().catch(function () { /* ignore */ });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
