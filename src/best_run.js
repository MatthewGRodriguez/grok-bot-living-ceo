/**
 * P70 C1: Real Best pipeline densest (extracted from createRuntime).
 * score · pick · enter · optional #2 · nested data · why · parent loop.
 *
 * ctx: {
 *   rootDir, registry, joys, groupOpts, loop,
 *   setParentGoal, saveParentLoop, saveLoopState,
 *   enterAndSample, densestSession, freeGbNow
 * }
 */
'use strict';

var modality = require('./modality');
var bestPick = require('./best_pick');
var bestNested = require('./best_nested');

/**
 * Real Best for parentId.
 * @param {object} ctx injectable runtime deps
 * @param {string} [parentId]
 * @returns {object} best result pack
 */
function runBest(ctx, parentId) {
  parentId = parentId || 'host';
  var loop = ctx.loop;
  var registry = ctx.registry;
  var joys = ctx.joys;

  loop.phase = 'best';
  loop.simulated = false;
  ctx.setParentGoal(parentId);
  if (loop.no_help_streak == null) loop.no_help_streak = 0;

  var scored = modality.scoreChildren(registry, parentId, joys, ctx.groupOpts());
  var ranked = scored.ranked;
  var layer = scored.layer || null;
  var freeGB = ctx.freeGbNow();
  var memCritical = freeGB != null && freeGB < 0.2;
  var memLeanBest = freeGB != null && freeGB < 0.15;

  var sessionRows =
    typeof ctx.densestSession === 'function' ? ctx.densestSession() || [] : [];
  var pick = bestPick.selectPick(
    parentId,
    ranked,
    loop,
    sessionRows,
    memCritical
  );
  var pickId = pick.pickId;
  var exploreNote = pick.exploreNote || 'enter_top';
  if (exploreNote === 'mem_critical_skip_probe') loop.last_probe_skip = true;
  else loop.last_probe_skip = false;

  var first = pickId ? ctx.enterAndSample(parentId, pickId, ranked) : null;
  var top = first && first.ok ? first.top : ranked[0] || null;
  var entered = first && first.ok ? first.entered : null;
  var sampleRow = first && first.ok ? first.sample : null;
  var graduation = first && first.ok ? first.graduation : null;
  var second = null;

  if (first && first.ok) {
    ranked = first.ranked || ranked;
    layer = first.layer || layer;
  }

  if (
    first &&
    first.ok &&
    !first.top.helped &&
    ranked.length > 1 &&
    exploreNote !== 'no_help_streak_pick_#2' &&
    !memLeanBest
  ) {
    var secondId = bestPick.selectSecondExplore(
      ranked,
      first.top.id,
      first,
      memCritical,
      parentId
    );
    if (secondId) {
      second = ctx.enterAndSample(parentId, secondId, ranked);
      if (second.ok) {
        ranked = second.ranked || ranked;
        layer = second.layer || layer;
        exploreNote = 'no_help_explore_#2';
        var pref = bestPick.preferSecond(first, second);
        top = pref.top;
        entered = pref.entered;
        sampleRow = pref.sampleRow;
        graduation = pref.graduation;
      }
    }
  }

  bestPick.applyNoHelpStreak(loop, top);

  var nested = null;
  var nested_chain = [];
  if (parentId === 'host' && top && top.id === 'data') {
    var nestRes = bestNested.runNestedData(
      {
        rootDir: ctx.rootDir,
        setParentGoal: ctx.setParentGoal,
        best: function (id) {
          return runBest(ctx, id);
        }
      },
      top
    );
    nested = nestRes.nested;
    nested_chain = nestRes.nested_chain || [];
    if (nestRes.exploreNoteSuffix) {
      exploreNote = exploreNote + nestRes.exploreNoteSuffix;
      loop.last_nested = nested_chain;
    }
  }

  loop.last_best = top ? top.id : null;
  loop.parent_j = top ? top.j : null;
  bestPick.applyLastWhy(loop, top, sampleRow, exploreNote);
  ctx.saveParentLoop(parentId);
  try {
    ctx.saveLoopState();
  } catch (_lsBest) { /* */ }

  return {
    ok: true,
    phase: 'best',
    simulated: false,
    parent: parentId,
    ranked: ranked,
    layer: layer,
    top: top,
    entered: entered,
    sample: sampleRow,
    second: second && second.ok ? second.top : null,
    nested: nested_chain.length
      ? {
          parent: 'data',
          chain: nested_chain,
          top: nested_chain[nested_chain.length - 1],
          last: nested
            ? { explore: nested.explore, layer: nested.layer }
            : null
        }
      : null,
    explore: exploreNote,
    graduation: graduation,
    no_help_streak: loop.no_help_streak,
    note:
      'j=layer share (local 0–1); j_raw=absolute; j_n=j_raw/n; judge+sample; ' +
      exploreNote
  };
}

module.exports = {
  runBest: runBest
};
