/**
 * Modality packages on disk + JAction wrappers for Exp6 ranking.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var jf = require('../vendor/exp6/JFactor_exp6.js');
var samples = require('./samples');
var debt = require('./debt');
var accel = require('./accel');
var exotelos = require('./exotelos');

var Joy = jf.Joy;
var JAction = jf.JAction;
var JGroup = jf.JGroup;

function readText(p) {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  } catch (_e) {
    return '';
  }
}

function loadManifest(modDir) {
  var p = path.join(modDir, 'MANIFEST.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadDocs(modDir) {
  var d = path.join(modDir, 'docs');
  return {
    HOW: readText(path.join(d, 'HOW.md')),
    WORKFLOW: readText(path.join(d, 'WORKFLOW.md')),
    RESEARCH: readText(path.join(d, 'RESEARCH.md')),
    GOALS: readText(path.join(d, 'GOALS.md')),
    EXTERNALS: readText(path.join(d, 'EXTERNALS.md')),
    // Exotelos densest — tertiary exogenous intention (required structure)
    EXOTELOS: readText(path.join(d, 'EXOTELOS.md')),
    BONDS: readText(path.join(d, 'BONDS.md'))
  };
}

function parseGoals(goalsMd) {
  var goals = [];
  String(goalsMd || '').split('\n').forEach(function (line) {
    var m = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (m) {
      goals.push({
        id: 'g:' + m[2].slice(0, 40).replace(/\s+/g, '_'),
        title: m[2].trim(),
        status: m[1] === ' ' ? 'open' : 'done'
      });
    }
  });
  return goals;
}

/**
 * Build a modality jmethod that respects jgroup.simulated.
 * effectiveness(state) → 0..1; work(state) only when !simulated.
 * Optional blendFn(prior, state) → j after samples.
 */
function makeModalityJMethod(spec) {
  var effectiveness = spec.effectiveness || function () { return 0.5; };
  var work = spec.work || function () { /* no-op */ };
  var blendFn = spec.blendFn || null;
  return function (x, y, jX, jY, jgroup) {
    var simulated = !!(jgroup && jgroup.simulated);
    var state = {
      x: x, y: y, jX: jX, jY: jY,
      jgroup: jgroup,
      simulated: simulated,
      modality: spec.id,
      helped: false,
      did: null,
      verified: false
    };
    if (simulated) {
      var priorSim = clamp01(effectiveness(state));
      return blendFn ? clamp01(blendFn(priorSim, state)) : priorSim;
    }
    work(state);
    // stash last work outcome for runtime sampling
    if (jgroup && jgroup.__lastWork) {
      jgroup.__lastWork[spec.id] = {
        helped: !!state.helped,
        did: state.did,
        verified: !!state.verified
      };
    }
    var priorReal = clamp01(effectiveness(state));
    return blendFn ? clamp01(blendFn(priorReal, state)) : priorReal;
  };
}

function clamp01(v) {
  v = Number(v);
  if (!isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function clearRequireCache(absPath) {
  try {
    var resolved = require.resolve(absPath);
    delete require.cache[resolved];
  } catch (_e) { /* not yet loaded or absolute miss */ }
  // also try raw path key
  try {
    delete require.cache[absPath];
  } catch (_e2) { /* */ }
}

/**
 * Load all modalities from modalities/ directory into a registry.
 */
function loadRegistry(rootDir) {
  var base = path.join(rootDir, 'modalities');
  var registry = Object.create(null);
  if (!fs.existsSync(base)) return registry;
  fs.readdirSync(base, { withFileTypes: true }).forEach(function (ent) {
    if (!ent.isDirectory()) return;
    var modDir = path.join(base, ent.name);
    var manifest = loadManifest(modDir);
    if (!manifest) {
      manifest = {
        id: ent.name,
        parent_id: ent.name === 'host' ? null : 'host',
        status: 'stable'
      };
    }
    var docs = loadDocs(modDir);
    var lambdaPath = path.join(modDir, 'lambda', 'index.js');
    var lambda = { effectiveness: null, work: null, explore: null };
    if (fs.existsSync(lambdaPath)) {
      try {
        clearRequireCache(path.resolve(lambdaPath));
        lambda = require(path.resolve(lambdaPath));
      } catch (e) {
        console.warn('[modality] lambda load failed', ent.name, e.message);
      }
    }
    var id = manifest.id || ent.name;
    var exoPack = null;
    try {
      exoPack = exotelos.loadFromModDir(modDir, manifest);
    } catch (_ex) {
      exoPack = exotelos.create({ origin: id });
    }
    var bonds = [];
    try {
      bonds = exotelos.loadBondsFromModDir(modDir, id, manifest);
    } catch (_b) {
      bonds = [];
    }
    registry[id] = {
      id: id,
      // Honor explicit null parent_id (multi-substrate root). Only default when key absent.
      parent_id: Object.prototype.hasOwnProperty.call(manifest, 'parent_id')
        ? manifest.parent_id
        : (ent.name === 'host' ? null : 'host'),
      status: manifest.status || 'probe',
      dir: modDir,
      manifest: manifest,
      docs: docs,
      goals: parseGoals(docs.GOALS),
      lambda: lambda,
      last_j: manifest.last_j != null ? manifest.last_j : null,
      exotelos: exoPack,
      bonds: bonds
    };
  });
  // P22: soft-restore last_j from samples after cold load (clearer hop0, not faster)
  try {
    restoreLastJFromSamples(rootDir, registry);
  } catch (_rj) { /* */ }
  return registry;
}

/**
 * P22: densest last_j re-enter from effectiveness samples (cold process).
 */
function restoreLastJFromSamples(rootDir, registry) {
  if (!rootDir || !registry) return;
  var all = samples.readAll(rootDir);
  if (!all.length) return;
  // walk newest → oldest; first hit per child wins
  var seen = Object.create(null);
  for (var i = all.length - 1; i >= 0; i--) {
    var row = all[i];
    if (!row || !row.child) continue;
    if (samples.isNoiseSample && samples.isNoiseSample(row)) continue;
    if (seen[row.child]) continue;
    if (row.j == null || !isFinite(Number(row.j))) continue;
    seen[row.child] = true;
    if (registry[row.child] && registry[row.child].last_j == null) {
      registry[row.child].last_j = Number(row.j);
    }
  }
}

/**
 * Build Exp6 JGroup of modality JActions under a parent.
 * Joys: dummy unit joys so signature holds (x,y always usable).
 * Effectiveness priors are blended with outcome samples when rootDir provided.
 */
function buildModalityJGroup(registry, parentId, sharedJoys, opts) {
  opts = opts || {};
  var rootDir = opts.rootDir || null;
  var group = new JGroup();
  group.name = parentId ? ('children_of_' + parentId) : 'root_modalities';
  group.simulated = false;
  group.__lastWork = Object.create(null);
  if (opts.loop) group.__livingLoop = opts.loop;

  var joyX = sharedJoys.x;
  var joyY = sharedJoys.y;

  Object.keys(registry).forEach(function (id) {
    var m = registry[id];
    if (m.id === parentId) return;
    // only direct children of parentId
    if ((m.parent_id || null) !== (parentId || null)) return;
    // revoked modalities leave the jgroup (noise control)
    if (m.status === 'revoked') return;

    var statusPrior = function () {
      if (m.status === 'stable') return 0.7;
      if (m.status === 'testing') return 0.5;
      if (m.status === 'probe') return 0.35;
      return 0.3;
    };

    var blendFn = null;
    if (rootDir) {
      blendFn = function (prior) {
        var st = samples.stats(rootDir, m.id, {
          parent: parentId,
          exclude_noise: true
        });
        var j = samples.blend(prior, st);
        var loop = opts.loop || (group && group.__livingLoop) || null;
        var applied = exotelos.applyLiveToPrior(j, m.exotelos, {
          open_goal: loop && loop.open_goal,
          open_next: loop && (loop.open_next || (loop.last_why && loop.last_why.child)),
          loop: loop,
          parent_id: parentId,
          bonds: m.bonds || []
        });
        if (group) {
          if (!group.__exoLive) group.__exoLive = Object.create(null);
          group.__exoLive[m.id] = applied.signal;
        }
        return applied.j;
      };
    }

    var jmethod = makeModalityJMethod({
      id: m.id,
      effectiveness: m.lambda.effectiveness || statusPrior,
      work: m.lambda.work || function () {},
      blendFn: blendFn
    });

    var action = new JAction(jmethod, null, 1, 1, joyX, joyY);
    action.name = m.id;
    action.__modalityId = m.id;
    group.Consider(action);
  });

  return group;
}

/**
 * Localize raw effectiveness scores within one jgroup layer.
 *
 * j_raw  ∈ [0,1]  absolute effectiveness (prior + samples)
 * j_n    = j_raw / n     — per-item scale (always ∈ [0,1] when j_raw is)
 * j_share= j_raw / sum   — competitive share (sums to 1, each ∈ [0,1])
 * j_rel  = j_raw / max   — top of layer = 1
 * j      = primary for Best: j_share (layer-local, always 0–1)
 *
 * Ranking order matches j_raw when all j_raw ≥ 0 (share preserves order).
 * Using share as primary keeps nested layers comparable: a 50-child probe
 * layer does not "look louder" than a 4-child host layer.
 */
function localizeLayer(ranked) {
  ranked = ranked || [];
  var n = ranked.length;
  if (!n) {
    return { ranked: [], layer: { n: 0, sum: 0, mean: 0 } };
  }
  var sum = 0;
  var max = 0;
  ranked.forEach(function (r) {
    var jr = Number(r.j);
    if (!isFinite(jr) || jr < 0) jr = 0;
    r.j_raw = jr;
    sum += jr;
    if (jr > max) max = jr;
  });
  if (sum <= 0) sum = 1e-9;
  if (max <= 0) max = 1e-9;
  var out = ranked.map(function (r) {
    var jRaw = r.j_raw;
    var jN = jRaw / n;
    var jShare = jRaw / sum;
    var jRel = jRaw / max;
    // Primary: competitive share (localized 0–1). Keep j_n for /n view.
    return {
      id: r.id,
      status: r.status,
      j_raw: jRaw,
      j_n: jN,
      j_share: jShare,
      j_rel: jRel,
      j: jShare,
      did: r.did,
      helped: r.helped,
      judge: r.judge
    };
  });
  out.sort(function (a, b) {
    // Prefer raw effectiveness order; share ties break same way
    if (b.j_raw !== a.j_raw) return b.j_raw - a.j_raw;
    return b.j - a.j;
  });
  return {
    ranked: out,
    layer: {
      n: n,
      sum: sum <= 1e-9 && max <= 1e-9 ? 0 : sum,
      mean: (sum <= 1e-9 && max <= 1e-9 ? 0 : sum) / n
    }
  };
}

/**
 * Score all children with simulated=true (no side effects).
 * Returns ranked [{id,j,j_raw,j_n,j_share,…}], group, layer stats.
 */
function scoreChildren(registry, parentId, sharedJoys, opts) {
  opts = opts || {};
  var group = buildModalityJGroup(registry, parentId, sharedJoys, opts);
  group.simulated = true;
  var actions = [];
  group.jgroup.forEach(function (a) {
    actions.push(a);
  });
  // Hard path: chunked parallel jmethod fan-out when n large (living n often small;
  // still wires real backend + reports path for hop0/living_perf).
  var scored = accel.mapParallel(
    actions,
    function (a) {
      var id = a.__modalityId || a.name;
      var j = 0;
      try {
        j = a.jmethod(a.x, a.y, a.jX, a.jY, group);
      } catch (_e) { /* */ }
      return {
        id: id,
        j: j,
        status: registry[id] ? registry[id].status : 'probe'
      };
    },
    {
      threshold: opts.parallel_n != null ? opts.parallel_n : accel.THRESH.worker_n,
      force_seq: !!opts.force_seq
    }
  );
  var ranked = scored.results || [];
  // P58: debt floors table (any parent) — sample blend must not erase densest debt targets
  if (opts.rootDir && debt.debtFloors) {
    var floors = debt.debtFloors(opts.rootDir, parentId);
    if (floors && floors.length) {
      var floorMap = Object.create(null);
      floors.forEach(function (f) {
        if (f && f.child) floorMap[f.child] = Number(f.floor) || 0;
      });
      ranked = ranked.map(function (r) {
        if (floorMap[r.id] != null) {
          r.j = Math.max(Number(r.j) || 0, floorMap[r.id]);
        }
        return r;
      });
    }
  }
  var loc = localizeLayer(ranked);
  loc.ranked.forEach(function (r) {
    if (registry[r.id]) registry[r.id].last_j = r.j;
  });
  return {
    group: group,
    ranked: loc.ranked,
    layer: loc.layer,
    exo_live: group.__exoLive || null,
    accel: {
      backend: scored.backend,
      n: scored.n,
      ms: scored.ms
    }
  };
}

/**
 * Enter one child for real work (simulated=false). Returns {j, work}.
 */
function enterChild(registry, parentId, sharedJoys, childId, opts) {
  opts = opts || {};
  var group = buildModalityJGroup(registry, parentId, sharedJoys, opts);
  group.simulated = false;
  var action = null;
  group.jgroup.forEach(function (a) {
    if ((a.__modalityId || a.name) === childId) action = a;
  });
  if (!action) {
    return { ok: false, error: 'child_not_in_jgroup', child: childId };
  }
  var j = 0;
  try {
    j = action.jmethod(action.x, action.y, action.jX, action.jY, group);
  } catch (e) {
    return { ok: false, error: String(e && e.message || e), child: childId };
  }
  if (registry[childId]) registry[childId].last_j = j;
  var workOut = (group.__lastWork && group.__lastWork[childId]) || {};
  return {
    ok: true,
    child: childId,
    j: j,
    j_raw: j,
    helped: !!workOut.helped,
    did: workOut.did || null,
    status: registry[childId] ? registry[childId].status : 'probe'
  };
}

function createSharedJoys() {
  // Exp6: Joy(jmax, polarity) — polarity must be ±Number.MIN_VALUE
  var x = new Joy(Number.MAX_VALUE, Number.MIN_VALUE);
  var y = new Joy(Number.MAX_VALUE, Number.MIN_VALUE);
  x.name = 'unit_x';
  y.name = 'unit_y';
  return { x: x, y: y };
}

module.exports = {
  loadRegistry: loadRegistry,
  loadDocs: loadDocs,
  loadDocs: loadDocs,
  makeModalityJMethod: makeModalityJMethod,
  buildModalityJGroup: buildModalityJGroup,
  scoreChildren: scoreChildren,
  enterChild: enterChild,
  localizeLayer: localizeLayer,
  createSharedJoys: createSharedJoys,
  restoreLastJFromSamples: restoreLastJFromSamples,
  clamp01: clamp01,
  Joy: Joy,
  JAction: JAction,
  JGroup: JGroup
};
