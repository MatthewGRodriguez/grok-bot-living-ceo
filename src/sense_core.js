/**
 * P66 C1: sense densest helpers (children · debt · why · forecast · open_goal).
 * Runtime still owns hop0 codec assembly + setParentGoal.
 */
'use strict';

var debt = require('./debt');
var forecastMod = require('./forecast');

/**
 * Ranked children of modality for hop0 children_ranked.
 */
function rankedChildren(registry, modalityId) {
  var children = Object.keys(registry)
    .filter(function (id) {
      var c = registry[id];
      return c.parent_id === modalityId && c.status !== 'revoked';
    })
    .map(function (id) {
      var c = registry[id];
      return {
        id: c.id,
        j: c.last_j,
        status: c.status
      };
    });
  children.sort(function (a, b) {
    var ja = a.j != null ? a.j : -1;
    var jb = b.j != null ? b.j : -1;
    return jb - ja;
  });
  return children;
}

/**
 * Open goal string densest for hop0.
 */
function resolveOpenGoal(m, loop) {
  loop = loop || {};
  if (m && m.goals && m.goals[0] && m.goals[0].title) {
    return m.goals[0].title;
  }
  if (m && m.manifest && m.manifest.boot_goal) {
    return String(m.manifest.boot_goal).slice(0, 64);
  }
  return loop.open_goal || null;
}

/**
 * Debt densest for any parent (table-backed).
 */
function resolveDebt(rootDir, modalityId) {
  try {
    if (debt.debtForParent) return debt.debtForParent(rootDir, modalityId);
    if (modalityId === 'host') return debt.hostDebt(rootDir);
    if (modalityId === 'data') return debt.dataDebt(rootDir);
  } catch (_d) { /* */ }
  return null;
}

/**
 * Parent-local why densest for hop0.
 */
function resolveWhyLocal(loop, modalityId) {
  loop = loop || {};
  if (loop.last_why && loop.last_best && loop.last_why.child === loop.last_best) {
    return loop.last_why;
  }
  if (loop.last_why && modalityId === 'host') {
    return loop.last_why;
  }
  if (loop.last_best) {
    return {
      child: loop.last_best,
      helped: null,
      j: loop.parent_j,
      did: null,
      explore: 'parent_local'
    };
  }
  return null;
}

/**
 * Forecast densest for hop0 (SparDA analog).
 */
function resolveForecast(opts) {
  opts = opts || {};
  try {
    return forecastMod.densestForecast({
      open_next: opts.open_next,
      debt: opts.debt && opts.debt.has ? opts.debt : null,
      skills: opts.skills,
      last_best: opts.last_best,
      last_why: opts.last_why,
      no_help_streak: opts.no_help_streak,
      open_goal: opts.open_goal,
      parent: opts.parent || opts.here || 'host',
      here: opts.here || opts.parent || 'host',
      bonds: opts.bonds || null
    });
  } catch (_fc) {
    return null;
  }
}

/**
 * Research tail densest last line.
 */
/**
 * P75: densest research tail for hop0 — prefer Open/operate densest, not densified_at meta.
 */
function researchTail(m) {
  if (!m || !m.docs || !m.docs.RESEARCH) return null;
  var lines = m.docs.RESEARCH.trim().split('\n').filter(Boolean);
  var i;
  for (i = 0; i < lines.length; i++) {
    var open = lines[i].match(/^\*\*Open:\*\*\s*(.+)$/i) || lines[i].match(/^Open:\s*(.+)$/i);
    if (open && open[1]) return String(open[1]).slice(0, 100);
  }
  // last non-meta densest bullet
  for (i = lines.length - 1; i >= 0; i--) {
    var L = lines[i];
    if (/densified_at|graduation_tail|^\s*-\s*count:|^\s*-\s*last:\s*—/.test(L)) {
      continue;
    }
    if (/^\s*-\s+/.test(L) || /^~~/.test(L) || /operate_close|rankCycle|REVIEW/.test(L)) {
      return L.replace(/^\s*-\s+/, '').slice(0, 120);
    }
  }
  return lines.length ? String(lines[lines.length - 1]).slice(0, 120) : null;
}

/**
 * Docs summary densest for sense return.
 */
function docsSummary(m) {
  if (!m) return null;
  return {
    has_HOW: !!(m.docs && m.docs.HOW),
    has_WORKFLOW: !!(m.docs && m.docs.WORKFLOW),
    goals_n: (m.goals || []).length
  };
}

module.exports = {
  rankedChildren: rankedChildren,
  resolveOpenGoal: resolveOpenGoal,
  resolveDebt: resolveDebt,
  resolveWhyLocal: resolveWhyLocal,
  resolveForecast: resolveForecast,
  researchTail: researchTail,
  docsSummary: docsSummary
};
