/**
 * P3/P69 C1: bounded auto-tick densest (extracted).
 * Never a background timer — caller invokes rankCycle injectably.
 */
'use strict';

/**
 * @param {object} ctx { rankCycle(opts), sense(parentId), loop }
 */
function autoTick(ctx, opts) {
  opts = opts || {};
  ctx = ctx || {};
  var loop = ctx.loop || {};
  var parentId = opts.parent || 'host';
  var maxCycles = opts.max_cycles != null ? Number(opts.max_cycles) : 3;
  if (!isFinite(maxCycles) || maxCycles < 1) maxCycles = 1;
  if (maxCycles > 12) maxCycles = 12;
  var stopStreak =
    opts.stop_no_help_streak != null ? Number(opts.stop_no_help_streak) : 2;
  if (!isFinite(stopStreak) || stopStreak < 1) stopStreak = 2;
  var thorough = !!opts.thorough;
  var thoroughEvery = !!opts.thorough_every;

  var cycles = [];
  var stop = null;
  for (var i = 0; i < maxCycles; i++) {
    var useThorough = thorough && (thoroughEvery || i === 0);
    var c = ctx.rankCycle({ parent: parentId, thorough: useThorough });
    var top = c.best && c.best.top;
    cycles.push({
      i: i,
      best: top && top.id,
      did: top && top.did,
      helped: !!(top && top.helped),
      j: top && top.j,
      nested:
        c.best && c.best.nested
          ? (c.best.nested.chain || [])
              .map(function (x) {
                return x.id;
              })
              .join('›')
          : null,
      skills_n: c.skills && c.skills.skills_n,
      session_n: c.session_tail && c.session_tail.n,
      thorough: useThorough,
      timing: c.timing || null
    });
    var pl =
      loop.by_parent && loop.by_parent[parentId]
        ? loop.by_parent[parentId]
        : loop;
    var streak =
      pl.no_help_streak != null ? pl.no_help_streak : loop.no_help_streak;
    if (streak >= stopStreak) {
      stop = 'no_help_streak:' + streak;
      break;
    }
  }
  return {
    ok: true,
    parent: parentId,
    max_cycles: maxCycles,
    ran: cycles.length,
    stop: stop || (cycles.length >= maxCycles ? 'max_cycles' : null),
    thorough: thorough,
    thorough_every: thoroughEvery,
    cycles: cycles,
    last_hop0: ctx.sense ? ctx.sense(parentId).hop0 : null,
    note: thorough
      ? 'opt-in thorough: denser explore (slower ok if densest help improves)'
      : 'opt-in only; no background timer'
  };
}

module.exports = {
  autoTick: autoTick
};
