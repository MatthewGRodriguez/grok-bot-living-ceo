/**
 * P70 C1: rankCycle post-best finish densest (history · session · skills · related · thrash).
 * Stages (sense→sim→explore→best) stay in createRuntime orchestrator.
 */
'use strict';

/**
 * Push history row, write session/skills/related, save loop, optional thrash.
 *
 * @param {object} ctx {
 *   rootDir, loop, history (mutated via return),
 *   writeSessionTail, crystallizeSkills, writeRelatedIndex,
 *   saveLoopState, archiveThrashPages, sense
 * }
 * @param {object} pack {
 *   parentId, memLean, thorough,
 *   sense, sim, explore, densified, trimInfo, best, timing
 * }
 * @returns {{ result, history }}
 */
function finishRankCycle(ctx, pack) {
  var loop = ctx.loop;
  var history = ctx.history || [];
  var parentId = pack.parentId || 'host';
  var memLean = !!pack.memLean;
  var b = pack.best;
  var sim = pack.sim;
  var ex = pack.explore;
  var densified = pack.densified;
  var timing = pack.timing;

  var row = {
    at: new Date().toISOString(),
    parent: parentId,
    sim_top: sim && sim.top,
    best_top: b && b.top,
    sample: b && b.sample,
    judge: b && b.top && b.top.judge,
    graduation: b && b.graduation
      ? {
          id: b.graduation.id,
          can: b.graduation.can_graduate,
          refused: b.graduation.refused
        }
      : null,
    densify: densified
      ? { saved: densified.saved, after: densified.after }
      : null,
    externals_n: (ex && ex.externals ? ex.externals : []).length,
    timing: timing,
    thorough: !!pack.thorough
  };
  history.push(row);
  if (history.length > 40) history = history.slice(-30);

  // P2 session tail · P17 lean still writes (tiny)
  var sessionTail = null;
  try {
    sessionTail = ctx.writeSessionTail(history);
  } catch (_st) { /* */ }

  // P1 skill crystallize — lean may skip FS farm if last_skills warm
  var skills = null;
  if (!memLean || !loop.last_skills || !loop.last_skills.length) {
    try {
      skills = ctx.crystallizeSkills(parentId);
    } catch (_sk) { /* */ }
  } else {
    skills = { ok: true, skills_n: loop.last_skills.length, lean_skip: true };
  }

  // P4 related index — lean skips
  var related = null;
  if (!memLean) {
    try {
      related = ctx.writeRelatedIndex();
      if (related && related.backend) loop.last_related_backend = related.backend;
    } catch (_rel) { /* */ }
  } else {
    related = { ok: true, lean_skip: true };
  }

  loop.phase = 'idle';

  // P40 A1: persist densest loop for MCP reload re-enter
  var loopSaved = null;
  try {
    loopSaved = ctx.saveLoopState();
  } catch (_ls) { /* */ }

  // P40 A3: thrash archive when page_z pads (host only, not lean)
  var thrashArch = null;
  if (parentId === 'host' && !memLean) {
    try {
      thrashArch = ctx.archiveThrashPages({ apply: true });
      if (thrashArch && thrashArch.n === 0) thrashArch = null;
    } catch (_ta) { /* */ }
  }

  var hop0 = null;
  try {
    hop0 = ctx.sense(parentId).hop0;
  } catch (_h) {
    hop0 = pack.sense && pack.sense.hop0;
  }

  return {
    history: history,
    result: {
      ok: true,
      sense: pack.sense,
      simulated_best: sim,
      explore: ex,
      densify: densified,
      sample_trim: pack.trimInfo || null,
      best: b,
      hop0: hop0,
      history_tail: history.slice(-3),
      session_tail: sessionTail,
      skills: skills,
      related: related,
      timing: timing,
      thorough: !!pack.thorough,
      lean: memLean,
      loop_state: loopSaved,
      thrash_archive: thrashArch
    }
  };
}

module.exports = {
  finishRankCycle: finishRankCycle
};
