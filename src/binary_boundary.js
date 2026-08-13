/**
 * P48: densest binary boundary status.
 * Law: source JS/md = author SoT · binary = compute/cold islands · assembly does not replace Grok surface.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var accel = require('./accel');
var cold = require('./cold');

function wasmKernelPath(rootDir) {
  return path.join(rootDir, 'vendor', 'exp6', 'tools', 'exp6_kernels.wasm');
}

function fileBytes(p) {
  try {
    if (fs.existsSync(p)) return fs.statSync(p).size;
  } catch (_e) { /* */ }
  return 0;
}

/**
 * Densest binary / execution tier map for hop0 + living_perf.
 */
function status(rootDir, opts) {
  opts = opts || {};
  rootDir = rootDir || path.join(__dirname, '..');
  var probe = accel.probe({ force: !!opts.force_probe });
  var coldList = cold.listCold(rootDir);
  var wasmP = wasmKernelPath(rootDir);
  var wasmBytes = fileBytes(wasmP);
  var exp6Js = fileBytes(path.join(rootDir, 'vendor', 'exp6', 'JFactor_exp6.js'));

  var wasmReady = !!(probe.simd && (probe.simd.ready || probe.simd.simd));
  var simd = !!(probe.simd && probe.simd.simd);
  var workersN = (probe.workers && probe.workers.size) || 0;
  var gpu = !!(probe.gpu && probe.gpu.available);

  var hop0 =
    'wasm=' +
    (wasmReady ? (simd ? 'simd' : 'Y') : 'N') +
    ' w=' +
    workersN +
    ' gpu=' +
    (gpu ? '1' : '0') +
    ' cold=' +
    (coldList.hop0 || '0') +
    ' src=js';

  return {
    ok: true,
    pilot: 'P48',
    law: 'source JS/md SoT · binary compute/cold islands · no full assembly replace',
    replace_source: false,
    hop0: hop0,
    tiers: {
      author: 'js · md · jsonl (Grok + git)',
      exec: 'node V8 JIT',
      wasm: {
        ready: wasmReady,
        simd: simd,
        path: wasmBytes ? 'vendor/exp6/tools/exp6_kernels.wasm' : null,
        bytes: wasmBytes,
        vs_js_bytes: exp6Js || null,
        note: simd
          ? 'Exp6 scoreSync/fieldBest SIMD'
          : wasmReady
            ? 'WASM ready scalar'
            : probe.simd && probe.simd.note
      },
      workers: {
        n: workersN,
        backend: (probe.workers && probe.workers.backend) || 'none',
        thr: accel.THRESH.worker_n
      },
      gpu: {
        available: gpu,
        ready: !!(probe.gpu && probe.gpu.ready),
        thr: accel.THRESH.gpu_n,
        note: (probe.gpu && probe.gpu.note) || null
      },
      cold: {
        n: coldList.n || 0,
        hop0: coldList.hop0 || '0',
        algo: cold.pickAlgo ? cold.pickAlgo() : 'gzip'
      },
      ane: (probe.ane && probe.ane.note) || 'N/A in Node'
    },
    thresholds: Object.assign({}, accel.THRESH),
    free_gb: probe.free_gb,
    mem_critical: probe.mem_critical,
    densest_do: [
      'keep source author SoT',
      'use wasm when score n≥' + accel.THRESH.simd_n,
      'workers when n≥' + accel.THRESH.worker_n,
      'gpu only n≥' + accel.THRESH.gpu_n,
      'cold hide thrash/archive',
      'never hop0 as binary blob'
    ]
  };
}

module.exports = {
  status: status,
  wasmKernelPath: wasmKernelPath
};
