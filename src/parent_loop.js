/**
 * P66 C1: parent-local loop snap restore/save (extracted from runtime).
 */
'use strict';

/**
 * Set open_goal for parent and restore by_parent snap.
 * Mutates loop.
 */
function setParentGoal(registry, loop, parentId) {
  var m = registry[parentId];
  if (m && m.goals && m.goals[0] && m.goals[0].title) {
    loop.open_goal = m.id + ':' + m.goals[0].title.slice(0, 48);
  } else if (m && m.manifest && m.manifest.boot_goal) {
    loop.open_goal = m.id + ':' + String(m.manifest.boot_goal).slice(0, 48);
  } else if (parentId === 'host') {
    loop.open_goal = 'host:live';
  } else {
    loop.open_goal = parentId + ':parent';
  }
  if (!loop.by_parent) loop.by_parent = Object.create(null);
  var snap = loop.by_parent[parentId];
  if (snap) {
    loop.last_best = snap.last_best;
    loop.parent_j = snap.parent_j;
    loop.no_help_streak = snap.no_help_streak || 0;
    loop.last_no_help_id = snap.last_no_help_id || null;
  } else {
    loop.last_best = null;
    loop.parent_j = null;
    loop.no_help_streak = 0;
    loop.last_no_help_id = null;
  }
  loop._active_parent = parentId;
}

/**
 * Persist densest by_parent snap for parentId.
 */
function saveParentLoop(loop, parentId) {
  if (!loop.by_parent) loop.by_parent = Object.create(null);
  loop.by_parent[parentId] = {
    last_best: loop.last_best,
    parent_j: loop.parent_j,
    no_help_streak: loop.no_help_streak || 0,
    last_no_help_id: loop.last_no_help_id || null
  };
}

module.exports = {
  setParentGoal: setParentGoal,
  saveParentLoop: saveParentLoop
};
