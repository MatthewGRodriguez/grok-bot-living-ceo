/**
 * Exotelos MCP/ops densest — modalities + world packs under store/pages/exotelos_world
 */
'use strict';

var fs = require('fs');
var path = require('path');
var exo = require('./exotelos');
var modality = require('./modality');

function worldDir(rootDir) {
  return path.join(rootDir, 'store', 'pages', 'exotelos_world');
}

function status(rootDir) {
  var reg = modality.loadRegistry(rootDir);
  var ids = Object.keys(reg);
  var withExo = ids.filter(function (id) {
    return reg[id].exotelos && reg[id].exotelos.exotelos;
  });
  var wdir = worldDir(rootDir);
  var worlds = [];
  try {
    if (fs.existsSync(wdir)) {
      worlds = fs.readdirSync(wdir).filter(function (f) {
        return f.endsWith('.md') || f.endsWith('.json');
      });
    }
  } catch (_e) { /* */ }
  return {
    ok: true,
    law: exo.LAW,
    modalities_n: ids.length,
    modalities_with_exotelos: withExo.length,
    world_dir: wdir,
    world_files: worlds.slice(0, 40),
    hop0_sample: reg.host && reg.host.exotelos ? exo.hop0Line(reg.host.exotelos) : null,
    live_control: true,
    pantheon_demo: 'store/pages/exotelos_world (demo only · not rank input)',
    jfactor_lab: 'paused · return later · living-core only now',
    actions: [
      'status',
      'law',
      'list',
      'get',
      'validate',
      'live',
      'expand',
      'compress',
      'temporal',
      'world_list',
      'world_get',
      'bond',
      'bonds',
      'bonds_get'
    ]
  };
}

function listModalities(rootDir) {
  var reg = modality.loadRegistry(rootDir);
  return {
    ok: true,
    modalities: Object.keys(reg).map(function (id) {
      var p = reg[id].exotelos || exo.create({ origin: id });
      return {
        id: id,
        origin: p.origin,
        primary: p.primary && p.primary.interest,
        secondary: p.secondary && p.secondary.interest,
        exo_other: p.exotelos && p.exotelos.other_origin,
        intention: p.exotelos && p.exotelos.intention,
        hop0: exo.hop0Line(p)
      };
    })
  };
}

function getModality(rootDir, id) {
  var reg = modality.loadRegistry(rootDir);
  id = id || 'host';
  var m = reg[id];
  if (!m) return { ok: false, error: 'modality_not_found', id: id };
  var pack = m.exotelos || exo.create({ origin: id });
  var v = exo.validate(pack);
  return {
    ok: true,
    id: id,
    pack: pack,
    validate: v,
    hop0: exo.hop0Line(pack),
    docs_has_EXOTELOS: !!(m.docs && m.docs.EXOTELOS)
  };
}

function expand(rootDir, opts) {
  opts = opts || {};
  var id = opts.id || opts.origin || 'host';
  var depth = opts.depth != null ? opts.depth : 3;
  var got = getModality(rootDir, id);
  if (!got.ok) return got;
  var pack = exo.expandAxes(got.pack, depth);
  return { ok: true, id: id, depth: depth, pack: pack };
}

function compress(rootDir, opts) {
  opts = opts || {};
  var id = opts.id || 'host';
  var got = getModality(rootDir, id);
  if (!got.ok) return got;
  return { ok: true, id: id, pack: exo.compressAxes(got.pack) };
}

function temporal(rootDir, opts) {
  opts = opts || {};
  var id = opts.id || 'host';
  var got = getModality(rootDir, id);
  if (!got.ok) return got;
  return exo.temporalExpand(got.pack);
}

/**
 * Densest Present Covenant bond (4 lines) between two origins.
 */
function bond(opts) {
  opts = opts || {};
  var a = String(opts.a || opts.from || 'A').slice(0, 40);
  var b = String(opts.b || opts.to || 'B').slice(0, 40);
  var fear = String(opts.fear || 'afraid to lose the bond').slice(0, 120);
  var role = String(opts.role || 'you hold the other half of this truth').slice(0, 120);
  var covenant = String(
    opts.covenant || 'I love when you are near and hate the silence of your leave'
  ).slice(0, 160);
  var incant = String(
    opts.incantatory ||
      'Destroy the world we share if you ever sever this without saying so'
  ).slice(0, 160);
  return {
    ok: true,
    a: a,
    b: b,
    lines: {
      line1_fear: 'I — ' + fear,
      line2_role: 'You — ' + role,
      line3_covenant: covenant,
      line4_incantatory: incant
    },
    intention: covenant,
    enforcement: incant,
    note: 'Present Covenant densest · Line3 active principle · Line4 conditional destruction'
  };
}

function worldList(rootDir) {
  var d = worldDir(rootDir);
  if (!fs.existsSync(d)) return { ok: true, files: [], note: 'no world yet' };
  var files = fs.readdirSync(d).sort();
  return { ok: true, dir: d, files: files, n: files.length };
}

function worldGet(rootDir, name) {
  var d = worldDir(rootDir);
  var base = String(name || 'index')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
  var candidates = [base, base + '.md', base + '.json', 'index.md'];
  for (var i = 0; i < candidates.length; i++) {
    var p = path.join(d, candidates[i]);
    if (fs.existsSync(p)) {
      var text = fs.readFileSync(p, 'utf8');
      return {
        ok: true,
        path: p,
        name: candidates[i],
        text: text.length > 12000 ? text.slice(0, 12000) + '\n…' : text,
        chars: text.length
      };
    }
  }
  return { ok: false, error: 'not_found', tried: candidates, dir: d };
}

function dispatch(rootDir, opts) {
  opts = opts || {};
  var action = String(opts.action || 'status').toLowerCase();
  if (action === 'status' || action === 'st') return status(rootDir);
  if (action === 'law') return { ok: true, law: exo.LAW, page: 'store/pages/exotelos_law.md' };
  if (action === 'list') return listModalities(rootDir);
  if (action === 'get') return getModality(rootDir, opts.id || opts.origin);
  if (action === 'validate') {
    var g = getModality(rootDir, opts.id || 'host');
    return g.ok ? { ok: true, id: g.id, validate: g.validate } : g;
  }
  if (action === 'live' || action === 'signal') {
    var idLive = opts.id || opts.origin || 'host';
    var gotLive = getModality(rootDir, idLive);
    if (!gotLive.ok) return gotLive;
    var loopHint = opts.open_goal
      ? { open_goal: opts.open_goal }
      : {};
    try {
      var loopState = require('./loop_state');
      var loopObj = {};
      loopState.load(rootDir, loopObj, {});
      if (loopObj.open_goal) loopHint.open_goal = loopObj.open_goal;
    } catch (_ls) { /* */ }
    var sig = exo.liveSignal(gotLive.pack, loopHint);
    var applied = exo.applyLiveToPrior(gotLive.pack, 0.5, loopHint);
    return {
      ok: true,
      id: idLive,
      live: sig,
      demo_prior_0_5_to: applied.j,
      law: 'soft delta only · samples+debt dominate · pantheon not used'
    };
  }
  if (action === 'expand') return expand(rootDir, opts);
  if (action === 'compress') return compress(rootDir, opts);
  if (action === 'temporal') return temporal(rootDir, opts);
  if (action === 'bond') return bond(opts);
  if (action === 'bonds' || action === 'bonds_list') {
    var regB = modality.loadRegistry(rootDir);
    var rows = Object.keys(regB).map(function (id) {
      return {
        id: id,
        n: (regB[id].bonds || []).length,
        to: (regB[id].bonds || []).map(function (b) {
          return b.to;
        })
      };
    });
    return { ok: true, modalities: rows, law: 'modality pantheon bonds · not fiction demo' };
  }
  if (action === 'bonds_get') {
    var idB = opts.id || opts.origin || 'host';
    var regG = modality.loadRegistry(rootDir);
    var mB = regG[idB];
    if (!mB) return { ok: false, error: 'modality_not_found', id: idB };
    var openB = opts.open_goal || '';
    try {
      var ls = require('./loop_state');
      var lo = {};
      ls.load(rootDir, lo, {});
      if (!openB && lo.open_goal) openB = lo.open_goal;
    } catch (_e) { /* */ }
    var bsig = exo.liveBondSignal(mB.bonds || [], {
      open_goal: openB,
      open_next: opts.open_next
    });
    return {
      ok: true,
      id: idB,
      bonds: mB.bonds || [],
      hop0: exo.hop0BondsLine(mB.bonds || []),
      live: bsig,
      docs_has_BONDS: !!(mB.docs && mB.docs.BONDS)
    };
  }
  if (action === 'world_list') return worldList(rootDir);
  if (action === 'world_get') return worldGet(rootDir, opts.name || opts.id);
  return {
    ok: false,
    error: 'unknown_action',
    actions: status(rootDir).actions
  };
}

module.exports = {
  status: status,
  listModalities: listModalities,
  getModality: getModality,
  expand: expand,
  compress: compress,
  temporal: temporal,
  bond: bond,
  worldList: worldList,
  worldGet: worldGet,
  dispatch: dispatch,
  worldDir: worldDir
};
