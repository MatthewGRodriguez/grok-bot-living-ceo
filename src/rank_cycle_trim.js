/**
 * P65 C1: rankCycle sample soft-trim densest (extracted).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var samples = require('./samples');

/**
 * Soft-trim effectiveness samples under mem pressure.
 * @returns {object|null} trimInfo
 */
function softTrimSamples(rootDir, mem, loop) {
  mem = mem || {};
  loop = loop || {};
  try {
    var nSamples = samples.readAll(rootDir).length;
    var trimCap = mem.trim_cap != null ? mem.trim_cap : 150;
    var keepN = mem.keep_n != null ? mem.keep_n : 100;
    if (nSamples <= trimCap) return null;
    var all = samples.readAll(rootDir);
    var keep = samples.softTrimRows
      ? samples.softTrimRows(all, keepN)
      : all.slice(-keepN);
    var sp = samples.samplesPath(rootDir);
    fs.mkdirSync(path.dirname(sp), { recursive: true });
    fs.writeFileSync(
      sp,
      keep.map(function (r) {
        return JSON.stringify(r);
      }).join('\n') + '\n',
      'utf8'
    );
    if (loop) loop.last_mem_trim = keep.length + 'of' + nSamples;
    return {
      before: nSamples,
      after: keep.length,
      mem_pressure: !!mem.memHigh,
      mem_critical: !!mem.memCritical,
      noise_pref: true
    };
  } catch (_t) {
    return null;
  }
}

/**
 * Densify EXTERNALS / RESEARCH when bloated (rankCycle mid-stage).
 */
function densifyHostDocs(registry, parentId, thorough, memLean, densify) {
  var densified = null;
  var hostMod = registry[parentId] || registry.host;
  if (!hostMod || !hostMod.dir || !densify) return { densified: null, hostMod: hostMod };
  var extPath = path.join(hostMod.dir, 'docs', 'EXTERNALS.md');
  try {
    if (fs.existsSync(extPath) && fs.statSync(extPath).size > 2500) {
      densified = densify.densifyExternals(hostMod.dir, {});
      if (densified.ok && hostMod.docs) {
        try {
          hostMod.docs.EXTERNALS = fs.readFileSync(extPath, 'utf8');
        } catch (_e) { /* */ }
      }
    }
    if (thorough && !memLean && densify.densifyResearch) {
      try {
        densify.densifyResearch(hostMod.dir, { force: false });
      } catch (_dr) { /* */ }
    }
  } catch (_e2) { /* */ }
  return { densified: densified, hostMod: hostMod };
}

/**
 * Attach free_gb / mem_pressure densify to timing after Best.
 */
function attachMemTiming(timing, opts, hostMod, densify, densified) {
  opts = opts || {};
  try {
    var freeGB = require('os').freemem() / (1024 * 1024 * 1024);
    timing.free_gb = Math.round(freeGB * 100) / 100;
    if (freeGB < 0.4) {
      timing.mem_pressure = true;
      if (opts.thorough_deferred_mem) timing.thorough_deferred_mem = true;
      if (hostMod && hostMod.dir && densify) {
        var densMem = densify.densifyExternals(hostMod.dir, {});
        if (densMem && densMem.ok) {
          densified = densified || densMem;
          timing.mem_pressure_densify = true;
        }
      }
    }
  } catch (_mp) { /* */ }
  return densified;
}

module.exports = {
  softTrimSamples: softTrimSamples,
  densifyHostDocs: densifyHostDocs,
  attachMemTiming: attachMemTiming
};
