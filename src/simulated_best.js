/**
 * P71 C1: SimulatedBest densest (extracted from createRuntime).
 * Effectiveness-only ranking + optional Exp6 SimulatedBest ordering signal.
 */
'use strict';

var modality = require('./modality');

/**
 * @param {object} ctx { registry, joys, loop, groupOpts, setParentGoal }
 * @param {string} [parentId]
 */
function runSimulatedBest(ctx, parentId) {
  parentId = parentId || 'host';
  var loop = ctx.loop;
  loop.phase = 'simulate';
  loop.simulated = true;
  if (typeof ctx.setParentGoal === 'function') ctx.setParentGoal(parentId);

  var scored = modality.scoreChildren(
    ctx.registry,
    parentId,
    ctx.joys,
    typeof ctx.groupOpts === 'function' ? ctx.groupOpts() : ctx.groupOpts || {}
  );
  var ranked = scored.ranked;
  try {
    var group = scored.group;
    group.simulated = true;
    group.SimulatedBest();
  } catch (_e) { /* ranking still from explicit scores */ }

  loop.parent_j = ranked[0] ? ranked[0].j : null;
  if (scored.accel) loop.last_score_accel = scored.accel;
  return {
    ok: true,
    phase: 'simulate',
    simulated: true,
    parent: parentId,
    ranked: ranked,
    layer: scored.layer || null,
    top: ranked[0] || null,
    accel: scored.accel || null,
    note: 'j is layer-local share (j_raw/sum); j_n=j_raw/n; j_raw=absolute effectiveness'
  };
}

module.exports = {
  runSimulatedBest: runSimulatedBest
};
