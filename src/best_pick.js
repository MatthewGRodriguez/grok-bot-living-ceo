/**
 * P65 C1: Best pick selection densest (streak · diversity · mem probe skip).
 */
'use strict';

var bestEnter = require('./best_enter');

/**
 * Choose which child to enter first under Best().
 * @returns {{ pickId, exploreNote }}
 */
function selectPick(parentId, ranked, loop, densestSessionRows, memCritical) {
  loop = loop || {};
  ranked = ranked || [];
  var pickId = ranked[0] ? ranked[0].id : null;
  var exploreNote = 'enter_top';

  // After repeated no-help on same winner, try #2 first
  if (
    loop.no_help_streak >= 2 &&
    ranked.length > 1 &&
    loop.last_no_help_id &&
    ranked[0].id === loop.last_no_help_id
  ) {
    pickId = ranked[1].id;
    exploreNote = 'no_help_streak_pick_#2';
  }

  // Diversity mono break
  var div = bestEnter.diversityPick(
    parentId,
    pickId,
    ranked,
    densestSessionRows || [],
    memCritical
  );
  if (div.exploreNote) {
    pickId = div.pickId;
    exploreNote = div.exploreNote;
  }

  // Under critical RAM, skip probe_* Best
  if (memCritical && parentId === 'host' && pickId && bestEnter.isProbeId(pickId)) {
    var alt = bestEnter.pickNonProbe(ranked, null);
    if (alt && alt !== pickId) {
      pickId = alt;
      exploreNote = 'mem_critical_skip_probe';
    }
  }

  // Under joy: never Best-enter host (host_tick thrash); prefer ash/mac/handoff/ceo_next
  if (parentId === 'joy' && pickId === 'host') {
    var joyPick = bestEnter.pickJoyChild(ranked, null);
    if (joyPick && joyPick !== pickId) {
      pickId = joyPick;
      exploreNote = 'joy_skip_host_tick';
    }
  }

  return { pickId: pickId, exploreNote: exploreNote };
}

/**
 * Update no_help_streak on loop from top outcome.
 */
function applyNoHelpStreak(loop, top) {
  if (!loop || !top) return;
  if (top.helped) {
    loop.no_help_streak = 0;
    loop.last_no_help_id = null;
  } else {
    if (loop.last_no_help_id === top.id) loop.no_help_streak += 1;
    else loop.no_help_streak = 1;
    loop.last_no_help_id = top.id;
  }
}

/**
 * Reify last_why densest on loop.
 */
function applyLastWhy(loop, top, sampleRow, exploreNote) {
  if (!loop) return;
  if (!top) {
    loop.last_why = null;
    return;
  }
  var jReasons =
    (top.judge && top.judge.reasons) ||
    (sampleRow && sampleRow.judge_reasons) ||
    [];
  loop.last_why = {
    child: top.id,
    helped: !!top.helped,
    j: top.j,
    did: top.did || (sampleRow && sampleRow.did) || null,
    explore: exploreNote || null,
    reasons: Array.isArray(jReasons) ? jReasons.slice(0, 5) : []
  };
}

/**
 * Choose second explore candidate after first no-help.
 */
function selectSecondExplore(ranked, pickId, first, memCritical, parentId) {
  if (!first || !first.ok || first.top.helped || ranked.length <= 1) {
    return null;
  }
  for (var i = 0; i < ranked.length; i++) {
    if (ranked[i].id === pickId) continue;
    if (parentId === 'joy' && ranked[i].id === 'host') continue; // joy_skip_host_second
    if (memCritical && parentId === 'host' && bestEnter.isProbeId(ranked[i].id)) {
      continue;
    }
    return ranked[i].id;
  }
  return null;
}

/**
 * Prefer second outcome when it helped or higher j_raw.
 */
function preferSecond(first, second) {
  if (!second || !second.ok || !second.top) {
    return { top: first.top, entered: first.entered, sampleRow: first.sample, graduation: first.graduation, useSecond: false };
  }
  var sRaw = second.top.j_raw != null ? second.top.j_raw : second.top.j;
  var fRaw = first.top.j_raw != null ? first.top.j_raw : first.top.j;
  if (second.top.helped || sRaw >= fRaw) {
    return {
      top: second.top,
      entered: second.entered,
      sampleRow: second.sample,
      graduation: second.graduation,
      useSecond: true
    };
  }
  first.top.explore_second = second.top;
  return {
    top: first.top,
    entered: first.entered,
    sampleRow: first.sample,
    graduation: first.graduation,
    useSecond: false
  };
}

module.exports = {
  selectPick: selectPick,
  applyNoHelpStreak: applyNoHelpStreak,
  applyLastWhy: applyLastWhy,
  selectSecondExplore: selectSecondExplore,
  preferSecond: preferSecond
};
