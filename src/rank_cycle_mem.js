/**
 * P63 C1: rankCycle memory / thorough preflight densest (extracted).
 * Pure helpers — no side effects.
 */
'use strict';

function freeGbNow() {
  try {
    return require('os').freemem() / (1024 * 1024 * 1024);
  } catch (_e) {
    return null;
  }
}

/**
 * @returns {{ free_gb, memHigh, memCritical, memLean, thorough, thorough_deferred_mem }}
 */
function memPlan(opts) {
  opts = opts || {};
  var freeGB = freeGbNow();
  var thorough = !!opts.thorough;
  var memHigh = freeGB != null && freeGB < 0.4;
  var memCritical = freeGB != null && freeGB < 0.2;
  var memLean = freeGB != null && freeGB < 0.15;
  var deferred = false;
  if (memHigh && thorough) {
    thorough = false;
    deferred = true;
  }
  return {
    free_gb: freeGB != null ? Math.round(freeGB * 100) / 100 : null,
    memHigh: memHigh,
    memCritical: memCritical,
    memLean: memLean,
    thorough: thorough,
    thorough_deferred_mem: deferred,
    trim_cap: memCritical ? 40 : memHigh ? 80 : 150,
    keep_n: memCritical ? 30 : memHigh ? 50 : 100
  };
}

module.exports = {
  freeGbNow: freeGbNow,
  memPlan: memPlan
};
