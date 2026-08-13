/**
 * P47 C1 / P40 A1 / P59: densest loop persist across MCP hard reload.
 * Whole-kernel: by_parent snaps · last_no_help · skills · why (not diary).
 */
'use strict';

var fs = require('fs');
var path = require('path');

var FILE = 'loop_state.json';

function statePath(rootDir) {
  return path.join(rootDir, 'store', 'pages', FILE);
}

/**
 * Slim by_parent for disk (only densest fields).
 */
function slimByParent(byParent) {
  if (!byParent || typeof byParent !== 'object') return null;
  var out = Object.create(null);
  Object.keys(byParent).forEach(function (pid) {
    var s = byParent[pid];
    if (!s || typeof s !== 'object') return;
    out[pid] = {
      last_best: s.last_best != null ? s.last_best : null,
      parent_j:
        s.parent_j != null && isFinite(Number(s.parent_j))
          ? Math.round(Number(s.parent_j) * 1000) / 1000
          : null,
      no_help_streak: s.no_help_streak || 0,
      last_no_help_id: s.last_no_help_id || null
    };
  });
  return out;
}

/**
 * Mutates loop (+ optional history array) from densest JSON.
 */
function load(rootDir, loop, historyRef) {
  try {
    var p = statePath(rootDir);
    if (!fs.existsSync(p)) return { ok: false, note: 'missing' };
    var s = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!s || typeof s !== 'object') return { ok: false, note: 'bad' };
    if (s.last_best != null) loop.last_best = s.last_best;
    if (s.parent_j != null) loop.parent_j = s.parent_j;
    if (s.open_goal) loop.open_goal = s.open_goal;
    if (s.by_parent && typeof s.by_parent === 'object') {
      loop.by_parent = s.by_parent;
    }
    if (s.last_why) loop.last_why = s.last_why;
    if (s.last_skills) loop.last_skills = s.last_skills;
    if (s.last_capture) loop.last_capture = s.last_capture;
    if (s.last_lore) loop.last_lore = s.last_lore;
    if (s.last_ranking) loop.last_ranking = s.last_ranking;
    if (s.last_timing) loop.last_timing = s.last_timing;
    if (s.no_help_streak != null) loop.no_help_streak = s.no_help_streak;
    if (s.last_no_help_id != null) loop.last_no_help_id = s.last_no_help_id;
    if (s.last_nested) loop.last_nested = s.last_nested;
    // P73: rehydrate slim history_tail → best_top shape for hop0 session=
    if (historyRef && Array.isArray(s.history_tail) && s.history_tail.length) {
      historyRef.history = s.history_tail.slice(-10).map(function (h) {
        if (h && h.best_top) return h;
        return {
          at: h && h.at,
          parent: h && h.parent,
          best_top: {
            id: h && (h.best || h.child || null),
            j: h && h.j != null ? h.j : null,
            helped: h && h.help != null ? !!h.help : null
          },
          best: h && h.best,
          j: h && h.j,
          help: h && h.help
        };
      });
    }
    // P73: refresh last_capture from captures_tail SoT when present
    try {
      var hop0Signals = require('./hop0_signals');
      var tailCap = hop0Signals.readCapturesTailLast
        ? hop0Signals.readCapturesTailLast(rootDir)
        : hop0Signals.densestLastCapture(rootDir, {});
      if (tailCap && tailCap.text) {
        loop.last_capture = {
          kind: tailCap.kind || 'capture',
          text: String(tailCap.text).slice(0, 120),
          at: tailCap.at || s.at
        };
      }
    } catch (_capHydrate) { /* */ }
    loop._restored_at = s.at || null;
    return {
      ok: true,
      at: s.at,
      last_best: loop.last_best,
      by_parent_n: loop.by_parent ? Object.keys(loop.by_parent).length : 0
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
}

function save(rootDir, loop, history) {
  try {
    var dir = path.join(rootDir, 'store', 'pages');
    fs.mkdirSync(dir, { recursive: true });
    var densest = {
      project: 'living-core',
      law: 'P59 loop persist · by_parent · densest re-enter · not diary',
      pilot: 'P59',
      at: new Date().toISOString(),
      last_best: loop.last_best || null,
      parent_j:
        loop.parent_j != null && isFinite(Number(loop.parent_j))
          ? Math.round(Number(loop.parent_j) * 1000) / 1000
          : null,
      open_goal: loop.open_goal ? String(loop.open_goal).slice(0, 96) : null,
      by_parent: slimByParent(loop.by_parent),
      no_help_streak: loop.no_help_streak || 0,
      last_no_help_id: loop.last_no_help_id || null,
      last_nested: Array.isArray(loop.last_nested)
        ? loop.last_nested.slice(-3).map(function (n) {
            return {
              id: n.id,
              j: n.j != null ? Math.round(Number(n.j) * 1000) / 1000 : null,
              helped: !!n.helped,
              did: n.did ? String(n.did).slice(0, 48) : null
            };
          })
        : null,
      last_why: loop.last_why
        ? {
            child: loop.last_why.child,
            helped: loop.last_why.helped,
            j:
              loop.last_why.j != null
                ? Math.round(Number(loop.last_why.j) * 1000) / 1000
                : null,
            did: loop.last_why.did
              ? String(loop.last_why.did).slice(0, 64)
              : null,
            explore: loop.last_why.explore
              ? String(loop.last_why.explore).slice(0, 48)
              : null,
            reasons: (loop.last_why.reasons || []).slice(0, 6)
          }
        : null,
      last_skills: (loop.last_skills || []).slice(0, 4).map(function (sk) {
        if (typeof sk === 'string') return { id: sk.slice(0, 40) };
        return {
          child: sk.child,
          did_prefix: sk.did_prefix,
          n_help: sk.n_help,
          id: sk.id
        };
      }),
      last_capture: loop.last_capture
        ? {
            kind: loop.last_capture.kind,
            text: String(loop.last_capture.text || '').slice(0, 120),
            at: loop.last_capture.at
          }
        : null,
      last_lore: loop.last_lore
        ? {
            text: loop.last_lore.text,
            rev: loop.last_lore.rev,
            branch: loop.last_lore.branch,
            server: loop.last_lore.server
          }
        : null,
      last_ranking: loop.last_ranking || null,
      // P74: keep stage ms densest (hop0 perf= sense/sim/explore/best after reload)
      last_timing: loop.last_timing
        ? {
            total_ms: loop.last_timing.total_ms,
            sense_ms: loop.last_timing.sense_ms,
            sim_ms: loop.last_timing.sim_ms,
            explore_ms: loop.last_timing.explore_ms,
            densify_ms: loop.last_timing.densify_ms,
            best_ms: loop.last_timing.best_ms,
            free_gb: loop.last_timing.free_gb,
            lean: loop.last_timing.lean,
            thorough: loop.last_timing.thorough,
            apps_skipped: !!loop.last_timing.apps_skipped,
            mem_critical: !!loop.last_timing.mem_critical
          }
        : null,
      history_tail: (history || []).slice(-5).map(function (h) {
        return {
          at: h.at,
          parent: h.parent,
          best: h.best_top && h.best_top.id,
          j:
            h.best_top && h.best_top.j != null
              ? Math.round(Number(h.best_top.j) * 1000) / 1000
              : null,
          help: h.best_top && h.best_top.helped
        };
      })
    };
    var p = statePath(rootDir);
    fs.writeFileSync(p, JSON.stringify(densest, null, 2) + '\n', 'utf8');
    return {
      ok: true,
      path: p,
      last_best: densest.last_best,
      by_parent_n: densest.by_parent ? Object.keys(densest.by_parent).length : 0
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  FILE: FILE,
  statePath: statePath,
  load: load,
  save: save,
  slimByParent: slimByParent
};
