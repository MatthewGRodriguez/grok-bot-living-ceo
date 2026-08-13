/**
 * P71 C1: rankCycle full pipeline densest (extracted from createRuntime).
 * sense → SimulatedBest → explore → densify → Best → finish writers.
 *
 * ctx: {
 *   loop, registry, densify,
 *   ensureRawWiki, setParentGoal,
 *   sense, simulatedBest, explore, best,
 *   writePerfLoopTail, writeSessionTail, crystallizeSkills,
 *   writeRelatedIndex, saveLoopState, archiveThrashPages,
 *   getHistory, setHistory,
 *   rootDir
 * }
 */
'use strict';

var rankCycleMem = require('./rank_cycle_mem');
var rankCycleTrim = require('./rank_cycle_trim');
var rankCycleFinish = require('./rank_cycle_finish');

/**
 * Parse parentId / opts from rankCycle arg.
 * @returns {{ parentId, opts }}
 */
function parseRankCycleArg(parentIdOrOpts) {
  var opts = {};
  var parentId = 'host';
  if (parentIdOrOpts && typeof parentIdOrOpts === 'object') {
    opts = parentIdOrOpts;
    parentId = opts.parent || 'host';
  } else {
    parentId = parentIdOrOpts || 'host';
  }
  return { parentId: parentId, opts: opts };
}

/**
 * Full rankCycle pipeline.
 * @param {object} ctx injectable stage fns + loop state
 * @param {string|object} parentIdOrOpts
 */
function runRankCycle(ctx, parentIdOrOpts) {
  var parsed = parseRankCycleArg(parentIdOrOpts);
  var parentId = parsed.parentId;
  var opts = parsed.opts;
  var loop = ctx.loop;
  var rootDir = ctx.rootDir;

  // P25: ensure raw/wiki split densest (idempotent)
  try {
    ctx.ensureRawWiki({});
  } catch (_rw) { /* */ }

  // P13/P14/P63: mem plan densest
  var mem = rankCycleMem.memPlan({ thorough: !!opts.thorough });
  var thorough = mem.thorough;
  var memCritical = mem.memCritical;
  var memLean = mem.memLean;
  if (mem.thorough_deferred_mem) {
    opts = Object.assign({}, opts, {
      thorough: false,
      thorough_deferred_mem: true
    });
  }
  loop.lean = !!memLean;
  loop.thorough = thorough;
  ctx.setParentGoal(parentId);

  // P40/P65: soft-trim via rank_cycle_trim
  var trimInfo = rankCycleTrim.softTrimSamples(rootDir, mem, loop);

  // P10: stage timings
  var t0 = Date.now();
  var s = ctx.sense(parentId);
  var tSense = Date.now();
  var sim = ctx.simulatedBest(parentId);
  var tSim = Date.now();
  var ex = ctx.explore(parentId, {
    thorough: thorough,
    skip_apps: memCritical,
    mem_critical: memCritical
  });
  var tExplore = Date.now();

  // P65: densify host docs
  var densPack = rankCycleTrim.densifyHostDocs(
    ctx.registry,
    parentId,
    thorough,
    memLean,
    ctx.densify
  );
  var densified = densPack.densified;
  var hostMod = densPack.hostMod;
  var tDens = Date.now();
  var b = ctx.best(parentId);
  var tBest = Date.now();
  var timing = {
    sense_ms: tSense - t0,
    sim_ms: tSim - tSense,
    explore_ms: tExplore - tSim,
    densify_ms: tDens - tExplore,
    best_ms: tBest - tDens,
    total_ms: tBest - t0,
    thorough: thorough,
    apps_skipped: !!memCritical,
    mem_critical: !!memCritical,
    lean: !!memLean
  };

  // P17 lean: skip perf_loop rewrite thrash
  if (!memLean) {
    try {
      ctx.writePerfLoopTail(timing, parentId, b && b.top);
    } catch (_pt) { /* */ }
  }

  // P12/P65: mem pressure densify
  if (parentId === 'host') {
    densified = rankCycleTrim.attachMemTiming(
      timing,
      opts,
      hostMod,
      ctx.densify,
      densified
    );
  }
  loop.last_timing = timing;

  // P70 finish writers
  var history = typeof ctx.getHistory === 'function' ? ctx.getHistory() : ctx.history;
  var fin = rankCycleFinish.finishRankCycle(
    {
      rootDir: rootDir,
      loop: loop,
      history: history,
      writeSessionTail: ctx.writeSessionTail,
      crystallizeSkills: ctx.crystallizeSkills,
      writeRelatedIndex: ctx.writeRelatedIndex,
      saveLoopState: ctx.saveLoopState,
      archiveThrashPages: ctx.archiveThrashPages,
      sense: ctx.sense
    },
    {
      parentId: parentId,
      memLean: memLean,
      thorough: thorough,
      sense: s,
      sim: sim,
      explore: ex,
      densified: densified,
      trimInfo: trimInfo,
      best: b,
      timing: timing
    }
  );
  if (fin.history && typeof ctx.setHistory === 'function') {
    ctx.setHistory(fin.history);
  }
  return fin.result;
}

module.exports = {
  parseRankCycleArg: parseRankCycleArg,
  runRankCycle: runRankCycle
};
