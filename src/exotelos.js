/**
 * Exotelos densest — origin · primary/secondary axes · tertiary exogenous intention.
 *
 * Law densest:
 * - origin: center of two independent axes (four opposites)
 * - primary / secondary: interests on this grid (alignment = rotation about origin)
 * - exotelos: tertiary interest in *another* origin’s intention on a *separate* grid
 *   · does not affect primary/secondary
 *   · may fade in time
 *   · recursive (other origin develops its own exotelos)
 * - endotelos: new points on the *same* grid
 * - expansion 1→2→4→8 · compression reverse · collapse leaves tertiary intact
 */
'use strict';

var fs = require('fs');
var path = require('path');

var LAW =
  'exotelos=tertiary exogenous intention on separate grid · no primary/secondary effect · may fade · recursive time';

/**
 * Normalize one interest axis densest.
 */
function axis(interest, poleA, poleB, id) {
  return {
    id: id || null,
    interest: String(interest || '').slice(0, 120),
    pole_a: String(poleA || '−').slice(0, 48),
    pole_b: String(poleB || '+').slice(0, 48)
  };
}

/**
 * Build densest exotelos pack.
 * @param {object} o
 */
function create(o) {
  o = o || {};
  var primary = o.primary || {};
  var secondary = o.secondary || {};
  var exo = o.exotelos || o.exo || {};
  return {
    version: 1,
    law: LAW,
    origin: String(o.origin || o.id || 'origin').slice(0, 64),
    primary: axis(
      primary.interest || o.primary_interest,
      primary.pole_a || primary.a,
      primary.pole_b || primary.b,
      'primary'
    ),
    secondary: axis(
      secondary.interest || o.secondary_interest,
      secondary.pole_a || secondary.a,
      secondary.pole_b || secondary.b,
      'secondary'
    ),
    exotelos: {
      other_origin: String(exo.other_origin || exo.other || 'other').slice(0, 64),
      other_primary: String(exo.other_primary || '').slice(0, 120),
      other_secondary: String(exo.other_secondary || '').slice(0, 120),
      intention: String(exo.intention || exo.hope || '').slice(0, 200),
      tertiary: exo.tertiary !== false,
      may_fade: exo.may_fade !== false,
      grid: exo.grid || 'separate',
      recursion: exo.recursion != null ? Number(exo.recursion) || 0 : 0,
      faded: !!exo.faded
    },
    endotelos: Array.isArray(o.endotelos)
      ? o.endotelos.slice(0, 8).map(function (e) {
          return String(e).slice(0, 80);
        })
      : [],
    axis_tree: o.axis_tree || null
  };
}

/**
 * Deterministic expansion: 1 origin → 2 core → 4 metaphysical → 8 physical labels densest.
 */
function expandAxes(pack, depth) {
  pack = create(pack);
  depth = depth != null ? depth : 3; // 1=core,2=meta,3=physical
  var root = {
    kind: 'origin',
    id: pack.origin,
    interest: pack.primary.interest + ' × ' + pack.secondary.interest
  };
  function branch(node, level, max) {
    if (level >= max) return node;
    var kinds = ['core', 'metaphysical', 'physical'];
    var k = kinds[level] || 'axis';
    node.children = [0, 1].map(function (i) {
      var child = {
        kind: k,
        id: node.id + '/' + k[0] + i,
        interest: (node.interest || 'axis') + '·' + (i === 0 ? 'a' : 'b'),
        pole: i === 0 ? '−' : '+'
      };
      return branch(child, level + 1, max);
    });
    return node;
  }
  pack.axis_tree = branch(root, 0, depth);
  pack.axis_depth = {
    core: 2,
    metaphysical: depth >= 2 ? 4 : 0,
    physical: depth >= 3 ? 8 : 0
  };
  return pack;
}

/**
 * Deterministic compression: walk leaves → pairs → origin densest summary.
 */
function compressAxes(pack) {
  pack = create(pack);
  if (!pack.axis_tree) pack = expandAxes(pack, 3);
  function leaves(n, out) {
    if (!n.children || !n.children.length) {
      out.push(n);
      return;
    }
    n.children.forEach(function (c) {
      leaves(c, out);
    });
  }
  var leaf = [];
  leaves(pack.axis_tree, leaf);
  // pair compress count densest
  var n = leaf.length;
  var stages = [];
  while (n > 1) {
    stages.push(n);
    n = Math.ceil(n / 2);
  }
  stages.push(1);
  pack.compression = {
    leaf_n: leaf.length,
    stages: stages,
    note: '8 physical → 4 meta → 2 core → 1 origin densest shape when full tree'
  };
  return pack;
}

/**
 * Temporal: child axes collapse except exotelos; new expansion inside exo frame.
 */
function temporalExpand(pack) {
  pack = create(pack);
  if (pack.exotelos.faded) {
    return { ok: false, error: 'exotelos_faded', pack: pack };
  }
  var child = create({
    origin: pack.exotelos.other_origin,
    primary: {
      interest: pack.exotelos.other_primary || 'other_primary',
      pole_a: '−',
      pole_b: '+'
    },
    secondary: {
      interest: pack.exotelos.other_secondary || 'other_secondary',
      pole_a: '−',
      pole_b: '+'
    },
    exotelos: {
      other_origin: pack.origin + '/future',
      intention: 'recursive exotelos +1 time',
      recursion: (pack.exotelos.recursion || 0) + 1
    }
  });
  child = expandAxes(child, 3);
  pack.temporal = { kind: 'expand', child: child };
  return { ok: true, pack: pack, child: child };
}

/**
 * hop0 densest line for one modality pack.
 */
function hop0Line(pack) {
  pack = create(pack);
  if (pack.exotelos.faded) return 'exo=faded origin=' + pack.origin;
  var exo = pack.exotelos;
  return (
    'exo=' +
    pack.origin +
    ' p=' +
    short(pack.primary.interest) +
    ' s=' +
    short(pack.secondary.interest) +
    ' →' +
    short(exo.other_origin) +
    ':' +
    short(exo.intention) +
    (exo.recursion ? ' r' + exo.recursion : '')
  );
}

function short(s) {
  return String(s || '—')
    .replace(/\s+/g, '_')
    .slice(0, 28);
}

/**
 * Parse docs/EXOTELOS.md densest (YAML-ish fields or manifest fallback).
 */
function parseDoc(md, fallback) {
  fallback = fallback || {};
  var o = {
    origin: fallback.origin,
    primary: Object.assign({}, fallback.primary || {}),
    secondary: Object.assign({}, fallback.secondary || {}),
    exotelos: Object.assign({}, (fallback.exotelos && fallback.exotelos.exotelos) || fallback.exotelos || {}),
    endotelos: []
  };
  // nested manifest shape: { primary, secondary, exotelos, endotelos }
  if (fallback.primary && fallback.primary.interest) o.primary = Object.assign({}, fallback.primary);
  if (fallback.secondary && fallback.secondary.interest) {
    o.secondary = Object.assign({}, fallback.secondary);
  }
  if (fallback.exotelos && fallback.exotelos.intention) {
    o.exotelos = Object.assign({}, fallback.exotelos);
  }
  var sawEndo = false;
  String(md || '')
    .split('\n')
    .forEach(function (line) {
      var m = line.match(/^-\s*(\w+):\s*(.+)$/);
      if (!m) return;
      var k = m[1];
      var v = m[2].trim();
      if (k === 'origin') o.origin = v;
      else if (k === 'primary') o.primary.interest = v;
      else if (k === 'primary_a') o.primary.pole_a = v;
      else if (k === 'primary_b') o.primary.pole_b = v;
      else if (k === 'secondary') o.secondary.interest = v;
      else if (k === 'secondary_a') o.secondary.pole_a = v;
      else if (k === 'secondary_b') o.secondary.pole_b = v;
      else if (k === 'other_origin') o.exotelos.other_origin = v;
      else if (k === 'other_primary') o.exotelos.other_primary = v;
      else if (k === 'other_secondary') o.exotelos.other_secondary = v;
      else if (k === 'intention' || k === 'exotelos') o.exotelos.intention = v;
      else if (k === 'endotelos') {
        sawEndo = true;
        if (o.endotelos.indexOf(v) < 0) o.endotelos.push(v);
      } else if (k === 'faded') o.exotelos.faded = /true|yes|1/i.test(v);
      else if (k === 'recursion') o.exotelos.recursion = parseInt(v, 10) || 0;
    });
  if (!sawEndo && fallback.endotelos && fallback.endotelos.length) {
    o.endotelos = fallback.endotelos.slice();
  }
  return create(o);
}

/**
 * Load pack from modality dir (MANIFEST.exotelos + docs/EXOTELOS.md).
 */
function loadFromModDir(modDir, manifest) {
  manifest = manifest || {};
  var md = '';
  try {
    var p = path.join(modDir, 'docs', 'EXOTELOS.md');
    if (fs.existsSync(p)) md = fs.readFileSync(p, 'utf8');
  } catch (_e) { /* */ }
  var me = manifest.exotelos || {};
  var base = {
    origin: manifest.id || path.basename(modDir),
    primary: me.primary || {},
    secondary: me.secondary || {},
    exotelos: me.exotelos || me,
    endotelos: me.endotelos || []
  };
  if (md) return parseDoc(md, base);
  return create(base);
}

/**
 * Render densest EXOTELOS.md body.
 */
function renderDoc(pack) {
  pack = create(pack);
  var exo = pack.exotelos;
  return [
    '# EXOTELOS — ' + pack.origin,
    '',
    '- law: ' + LAW,
    '- origin: ' + pack.origin,
    '- primary: ' + pack.primary.interest,
    '- primary_a: ' + pack.primary.pole_a,
    '- primary_b: ' + pack.primary.pole_b,
    '- secondary: ' + pack.secondary.interest,
    '- secondary_a: ' + pack.secondary.pole_a,
    '- secondary_b: ' + pack.secondary.pole_b,
    '- other_origin: ' + exo.other_origin,
    '- other_primary: ' + (exo.other_primary || '—'),
    '- other_secondary: ' + (exo.other_secondary || '—'),
    '- intention: ' + exo.intention,
    '- tertiary: true',
    '- may_fade: true',
    '- grid: separate',
    '- recursion: ' + (exo.recursion || 0),
    '- faded: ' + (!!exo.faded),
    ''
  ]
    .concat(
      (pack.endotelos || []).map(function (e) {
        return '- endotelos: ' + e;
      })
    )
    .concat([
      '',
      '## axis densest',
      '- expansion: 1 origin → 2 core → 4 metaphysical → 8 physical',
      '- compression: reverse pairs → origin',
      '- collapse: tertiary exotelos may persist',
      '',
      '## actions densest',
      '- action = rotation about origin toward an interest (time ∝ rotation)',
      '- stronger alignment → smaller rotations easier',
      '- if interest fades mid-action → align to opposite pole',
      '',
      '## writing densest',
      '- primary/secondary = life outside writing',
      '- writing itself often **exotelos** (persists beyond axis)',
      '- unknown / chaos → catalyst for further exotelos',
      '',
      '[[exotelos_law]] [[wiki_law]]',
      ''
    ])
    .join('\n');
}

/**
 * Validate densest: has origin, two interests, tertiary intention separate.
 */
function validate(pack) {
  pack = create(pack);
  var errs = [];
  if (!pack.origin) errs.push('origin_required');
  if (!pack.primary.interest) errs.push('primary_required');
  if (!pack.secondary.interest) errs.push('secondary_required');
  if (!pack.exotelos.intention) errs.push('exotelos_intention_required');
  if (!pack.exotelos.other_origin) errs.push('other_origin_required');
  if (pack.exotelos.other_origin === pack.origin) {
    errs.push('exotelos_must_be_separate_origin');
  }
  return { ok: errs.length === 0, errors: errs, pack: pack };
}

/**
 * hop0 multi-modality densest: host pack or first child with exo.
 */
function densestHop0Exo(registry, modalityId) {
  if (!registry) return null;
  var id = modalityId || 'host';
  var m = registry[id];
  if (m && m.exotelos) return hop0Line(m.exotelos);
  if (id !== 'host' && registry.host && registry.host.exotelos) {
    return hop0Line(registry.host.exotelos);
  }
  return null;
}

/**
 * Live control soft delta for rankCycle j (not pantheon demo).
 * Does not dominate samples or debt floors. Faded tertiary dampens slightly.
 * Open-goal token overlap with intention lifts slightly.
 * @returns {{ delta: number, reasons: string[] }}
 */
function liveSignal(pack, ctx) {
  pack = create(pack || {});
  ctx = ctx || {};
  var reasons = [];
  var d = 0;
  var v = validate(pack);
  if (v.ok) {
    d += 0.015;
    reasons.push('+exo_declared');
  } else {
    reasons.push('-exo_incomplete');
  }
  if (pack.exotelos.faded) {
    d -= 0.03;
    reasons.push('-exo_faded');
  } else if (pack.exotelos.intention) {
    d += 0.01;
    reasons.push('+exo_live');
  }
  var open = String(
    ctx.open_goal || ctx.openGoal || (ctx.loop && ctx.loop.open_goal) || ''
  ).toLowerCase();
  var intent = String(pack.exotelos.intention || '').toLowerCase();
  var other = String(pack.exotelos.other_origin || '').toLowerCase();
  if (open && intent) {
    var hits = 0;
    intent.split(/[^a-z0-9]+/).forEach(function (t) {
      if (t.length > 3 && open.indexOf(t) >= 0) hits++;
    });
    if (hits >= 2) {
      d += 0.04;
      reasons.push('+exo_goal_overlap');
    } else if (hits === 1) {
      d += 0.02;
      reasons.push('+exo_goal_soft');
    }
  }
  if (other && open && open.indexOf(other.replace(/_/g, ' ')) >= 0) {
    d += 0.015;
    reasons.push('+exo_other_in_goal');
  }
  if (d > 0.08) d = 0.08;
  if (d < -0.05) d = -0.05;
  return {
    delta: Math.round(d * 1000) / 1000,
    reasons: reasons,
    faded: !!pack.exotelos.faded,
    tertiary: pack.exotelos.tertiary !== false
  };
}

function applyLiveToPrior(prior, pack, ctx) {
  var sig = liveSignal(pack, ctx);
  var bondSig = liveBondSignal(ctx.bonds || [], ctx);
  var j = Number(prior);
  if (!isFinite(j)) j = 0;
  var total = sig.delta + bondSig.delta;
  if (total > 0.1) total = 0.1;
  if (total < -0.06) total = -0.06;
  j = j + total;
  if (j < 0) j = 0;
  if (j > 1) j = 1;
  var reasons = (sig.reasons || []).concat(bondSig.reasons || []);
  return {
    j: j,
    signal: {
      delta: Math.round(total * 1000) / 1000,
      reasons: reasons,
      exo: sig,
      bonds: bondSig
    }
  };
}

function normalizeBond(b, fromId) {
  b = b || {};
  return {
    from: String(b.from || fromId || '').slice(0, 64),
    to: String(b.to || b.other || '').slice(0, 64),
    fear: String(b.fear || '').slice(0, 160),
    role: String(b.role || '').slice(0, 160),
    covenant: String(b.covenant || b.intention || '').slice(0, 200),
    incantatory: String(b.incantatory || b.enforcement || '').slice(0, 200),
    faded: !!b.faded
  };
}

/**
 * Parse docs/BONDS.md — modality pantheon bonds (not fiction demo).
 * ## → crystallize
 * - fear: …
 * - role: …
 * - covenant: …
 * - incantatory: …
 */
function parseBondsDoc(md, fromId) {
  var bonds = [];
  var cur = null;
  String(md || '')
    .split('\n')
    .forEach(function (line) {
      var h = line.match(/^##\s*(?:→|to:)?\s*([a-zA-Z0-9_./-]+)\s*$/);
      if (h) {
        if (cur && cur.to) bonds.push(normalizeBond(cur, fromId));
        cur = { to: h[1], from: fromId };
        return;
      }
      if (!cur) return;
      var m = line.match(/^-\s*(\w+):\s*(.+)$/);
      if (!m) return;
      var k = m[1].toLowerCase();
      var v = m[2].trim();
      if (k === 'fear') cur.fear = v;
      else if (k === 'role') cur.role = v;
      else if (k === 'covenant' || k === 'intention') cur.covenant = v;
      else if (k === 'incantatory' || k === 'enforcement' || k === 'incant') {
        cur.incantatory = v;
      } else if (k === 'faded') cur.faded = /true|yes|1/i.test(v);
      else if (k === 'to' || k === 'other') cur.to = v;
    });
  if (cur && cur.to) bonds.push(normalizeBond(cur, fromId));
  return bonds;
}

function renderBondsDoc(fromId, bonds) {
  var lines = [
    '# BONDS — ' + fromId,
    '',
    '- law: modality pantheon Present Covenant · tertiary to primary work · may fade',
    '- from: ' + fromId,
    '- note: not fiction pantheon · feeds liveSignal soft rank only',
    ''
  ];
  (bonds || []).forEach(function (b) {
    b = normalizeBond(b, fromId);
    lines.push('## → ' + b.to);
    lines.push('- fear: ' + (b.fear || '—'));
    lines.push('- role: ' + (b.role || '—'));
    lines.push('- covenant: ' + (b.covenant || '—'));
    lines.push('- incantatory: ' + (b.incantatory || '—'));
    if (b.faded) lines.push('- faded: true');
    lines.push('');
  });
  lines.push('[[exotelos_law]] [[research_exotelos]]');
  lines.push('');
  return lines.join('\n');
}

function loadBondsFromModDir(modDir, modalityId, manifest) {
  var fromMd = [];
  try {
    var p = path.join(modDir, 'docs', 'BONDS.md');
    if (fs.existsSync(p)) {
      fromMd = parseBondsDoc(fs.readFileSync(p, 'utf8'), modalityId);
    }
  } catch (_e) { /* */ }
  var fromMan = [];
  if (manifest && Array.isArray(manifest.bonds)) {
    fromMan = manifest.bonds.map(function (b) {
      return normalizeBond(b, modalityId);
    });
  }
  var byTo = Object.create(null);
  fromMan.concat(fromMd).forEach(function (b) {
    if (!b.to) return;
    byTo[b.to] = b;
  });
  return Object.keys(byTo).map(function (k) {
    return byTo[k];
  });
}

/**
 * Soft rank from modality–modality bonds (Present Covenant).
 * Lift when open_goal / open_next mentions bond.to or covenant tokens.
 * Faded bond dampens. Soft bounds.
 */
function liveBondSignal(bonds, ctx) {
  bonds = bonds || [];
  ctx = ctx || {};
  var reasons = [];
  var d = 0;
  if (!bonds.length) {
    return { delta: 0, reasons: ['bond_none'], n: 0 };
  }
  var open = String(
    ctx.open_goal ||
      ctx.openGoal ||
      (ctx.loop && ctx.loop.open_goal) ||
      ''
  ).toLowerCase();
  var openNext = String(
    ctx.open_next || (ctx.loop && ctx.loop.open_next) || ''
  ).toLowerCase();
  var blob = open + ' ' + openNext;
  var nHit = 0;
  bonds.forEach(function (b) {
    b = normalizeBond(b);
    if (b.faded) {
      d -= 0.01;
      reasons.push('-bond_faded:' + b.to);
      return;
    }
    if (!b.covenant && !b.to) return;
    var local = 0;
    if (b.to && blob.indexOf(String(b.to).toLowerCase()) >= 0) {
      local += 0.03;
      reasons.push('+bond_to:' + b.to);
    }
    if (b.covenant && open) {
      var hits = 0;
      String(b.covenant)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .forEach(function (t) {
          if (t.length > 3 && open.indexOf(t) >= 0) hits++;
        });
      if (hits >= 2) {
        local += 0.035;
        reasons.push('+bond_covenant');
      } else if (hits === 1) {
        local += 0.015;
        reasons.push('+bond_covenant_soft');
      }
    }
    if (local > 0) nHit++;
    d += local;
  });
  if (bonds.length && nHit === 0) {
    d += 0.005;
    reasons.push('+bond_graph');
  }
  if (d > 0.07) d = 0.07;
  if (d < -0.04) d = -0.04;
  return {
    delta: Math.round(d * 1000) / 1000,
    reasons: reasons,
    n: bonds.length,
    hits: nHit
  };
}

function hop0BondsLine(bonds) {
  bonds = bonds || [];
  if (!bonds.length) return null;
  var parts = bonds.slice(0, 4).map(function (b) {
    b = normalizeBond(b);
    return b.to + (b.faded ? '!' : '');
  });
  return 'bonds=' + parts.join(',');
}

/**
 * Soft open_next / forecast partner from Present Covenant.
 * Prefer covenant hit on open_goal; else first non-faded bond.to.
 * Never overrides debt floors — caller only appends on soft paths.
 */
function bondOpenHint(bonds, ctx) {
  bonds = bonds || [];
  ctx = ctx || {};
  if (!bonds.length) return null;
  var open = String(
    ctx.open_goal ||
      ctx.openGoal ||
      (ctx.loop && ctx.loop.open_goal) ||
      ''
  ).toLowerCase();
  var openNext = String(
    ctx.open_next || (ctx.loop && ctx.loop.open_next) || ''
  ).toLowerCase();
  var blob = open + ' ' + openNext;
  var best = null;
  var bestScore = -1;
  bonds.forEach(function (raw) {
    var b = normalizeBond(raw);
    if (!b.to || b.faded) return;
    var score = 1;
    if (blob.indexOf(String(b.to).toLowerCase()) >= 0) score += 4;
    if (b.covenant && open) {
      String(b.covenant)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .forEach(function (t) {
          if (t.length > 3 && open.indexOf(t) >= 0) score += 1;
        });
    }
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  });
  if (!best) return null;
  return {
    to: best.to,
    hit: bestScore >= 4,
    tag: 'bond→' + best.to,
    covenant: best.covenant || ''
  };
}

function appendBondHint(line, bonds, ctx) {
  var base = String(line || '').slice(0, 96);
  var h = bondOpenHint(bonds, ctx);
  if (!h || !h.to) return base;
  if (base.indexOf('bond→') >= 0 || base.indexOf(h.to) >= 0) return base;
  var add = ' · ' + h.tag;
  if (base.length + add.length <= 96) return base + add;
  return base;
}

module.exports = {
  LAW: LAW,
  axis: axis,
  create: create,
  expandAxes: expandAxes,
  compressAxes: compressAxes,
  temporalExpand: temporalExpand,
  hop0Line: hop0Line,
  parseDoc: parseDoc,
  loadFromModDir: loadFromModDir,
  renderDoc: renderDoc,
  validate: validate,
  densestHop0Exo: densestHop0Exo,
  liveSignal: liveSignal,
  applyLiveToPrior: applyLiveToPrior,
  normalizeBond: normalizeBond,
  parseBondsDoc: parseBondsDoc,
  renderBondsDoc: renderBondsDoc,
  loadBondsFromModDir: loadBondsFromModDir,
  liveBondSignal: liveBondSignal,
  hop0BondsLine: hop0BondsLine,
  bondOpenHint: bondOpenHint,
  appendBondHint: appendBondHint
};
