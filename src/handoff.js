/**
 * P56/P57 — attention handoff (NVIDIA KV-transfer process analog).
 * Transfer densest process attention across session/agent/model swap
 * without full re-prefill of catalogs.
 *
 * Law: strip volatile (position-like) · keep structure · notes own memory · model replaceable
 * Closed-form pack — not a learned adapter.
 * P57: fidelity + re-enter checklist (second-brain · SparDA prefetch paths)
 */
'use strict';

var path = require('path');
var fs = require('fs');
var forecast = require('./forecast');
var toon = require('./toon');

/**
 * Strip volatile meta so handoff is position-free (RoPE-strip analog).
 */
function stripVolatile(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(stripVolatile);
  if (typeof obj !== 'object') return obj;
  var out = {};
  Object.keys(obj).forEach(function (k) {
    if (k === 'at' || k === '_restored_at' || k === 'mtime' || k === 'ts') return;
    // drop ultra-fine floats that thrash equality
    var v = obj[k];
    if (typeof v === 'number' && !Number.isInteger(v)) {
      out[k] = Math.round(v * 1000) / 1000;
    } else if (v && typeof v === 'object') {
      out[k] = stripVolatile(v);
    } else {
      out[k] = v;
    }
  });
  return out;
}

/**
 * Build transferable densest attention pack.
 * ctx from runtime sense densest fields.
 * P58: here= parent modality — not host-hardcoded.
 */
function buildHandoff(rootDir, ctx) {
  ctx = ctx || {};
  var here = String(ctx.here || ctx.modality || ctx.parent || 'host');
  var openNext = ctx.open_next || null;
  var skills = slimSkills(ctx.skills);
  var debt = ctx.debt && ctx.debt.has
    ? { has: true, reasons: (ctx.debt.reasons || []).slice(0, 4) }
    : { has: false };
  var why = ctx.why
    ? {
        child: ctx.why.child || null,
        helped: !!ctx.why.helped,
        did: ctx.why.did ? String(ctx.why.did).slice(0, 48) : null,
        j: ctx.why.j != null ? Math.round(Number(ctx.why.j) * 1000) / 1000 : null
      }
    : null;
  var fc = forecast.forecastStruct({
    open_next: openNext,
    debt: debt.has ? debt : null,
    skills: ctx.skills,
    last_best: ctx.last_best || (ctx.loop && ctx.loop.last_best),
    last_why: why,
    no_help_streak: ctx.no_help_streak != null
      ? ctx.no_help_streak
      : ctx.loop && ctx.loop.no_help_streak,
    open_goal: ctx.open_goal,
    parent: here,
    here: here
  });

  // JIT paths only — bodies load on demand (top-k source layers analog)
  var pagesJit = densestPagePaths(rootDir, fc.page, ctx.links, here);

  var pack = {
    ok: true,
    pilot: 'P58',
    law:
      'transfer densest attention · strip volatile · notes own memory · model replaceable · not bigger chat · parent-local',
    // stable prefix (KV-cache friendly)
    stable: {
      codec: ctx.codec || 'attention-live-v2',
      here: here,
      quality_law:
        'speed≠everything · smarter≠faster · clearer≠optimal · write_only_needed',
      links: (ctx.links || []).slice(0, 6).map(function (l) {
        return typeof l === 'string' ? l : l.id || l;
      })
    },
    // semi — changes slowly
    semi: {
      open_next: openNext ? String(openNext).slice(0, 96) : null,
      skills: skills,
      forecast: fc.line,
      binary: ctx.binary ? String(ctx.binary).slice(0, 64) : null,
      related: (ctx.related || []).slice(0, 4).map(function (r) {
        return typeof r === 'string' ? r : r.id || r;
      })
    },
    // dynamic snapshot densest (not full tails)
    dynamic: {
      here: here,
      last_best: ctx.last_best || (ctx.loop && ctx.loop.last_best) || null,
      parent_j:
        ctx.parent_j != null
          ? Math.round(Number(ctx.parent_j) * 1000) / 1000
          : ctx.loop && ctx.loop.parent_j != null
            ? Math.round(Number(ctx.loop.parent_j) * 1000) / 1000
            : null,
      debt: debt,
      why: why,
      open_goal: ctx.open_goal
        ? String(ctx.open_goal).slice(0, 64)
        : ctx.loop && ctx.loop.open_goal
          ? String(ctx.loop.open_goal).slice(0, 64)
          : null
    },
    // what to load next (Forecast targets)
    forecast: fc,
    pages_jit: pagesJit,
    // never embed L4 raw / full samples by default
    hide: ['L4_raw', 'L5_archive', 'full_samples', 'tool_schema_dump']
  };

  // P57: re-enter checklist densest (SparDA prefetch targets — paths not bodies)
  pack.reenter = [
    'read open_next + forecast (act, do not re-list tools)',
    fc.skill ? 'JIT skill:' + fc.skill : 'skill: hop0 skills= only if needed',
    (pagesJit[0] && pagesJit[0].id)
      ? 'JIT page:' + pagesJit[0].id
      : 'JIT page:operate_close'
  ];
  pack.map = {
    family: 'attention-live-v2',
    strip_volatile: true,
    top_k_sources: Math.min(8, pagesJit.length + skills.length),
    matched: true,
    note: 'same codec family only · cross-harness future'
  };

  pack = stripVolatile(pack);

  var format = String(ctx.format || 'toon').toLowerCase();
  var rows = [
    {
      k: 'here',
      v: here
    },
    {
      k: 'open_next',
      v: pack.semi.open_next || ''
    },
    {
      k: 'forecast',
      v: pack.semi.forecast || ''
    },
    {
      k: 'last_best',
      v: pack.dynamic.last_best || ''
    },
    {
      k: 'skill0',
      v: (skills[0] && skills[0].id) || ''
    },
    {
      k: 'page0',
      v: (pagesJit[0] && pagesJit[0].id) || ''
    },
    {
      k: 'debt',
      v: debt.has ? (debt.reasons[0] || 'Y') : 'N'
    },
    {
      k: 'reenter0',
      v: (pack.reenter && pack.reenter[0]) || ''
    }
  ];

  var packed = null;
  if (format === 'toon' || format === 'json' || format === 'json_compact') {
    try {
      packed = toon.encode
        ? toon.encode(rows, { name: 'handoff' })
        : null;
      if (format === 'json' || format === 'json_compact') {
        packed = {
          ok: true,
          format: 'json_compact',
          text: JSON.stringify(rows),
          tok_est: null
        };
      }
    } catch (_e) {
      packed = null;
    }
  }

  var toonTok =
    packed && packed.ok
      ? packed.tok_est != null
        ? packed.tok_est
        : estimateTok(packed.text)
      : estimateTok(JSON.stringify(rows));
  // Full hop0 text estimate for fidelity (skip re-prefill of catalogs)
  var fullTokEst = estimateTok(String(ctx.hop0_text || ctx.sense_text || ''));
  if (!fullTokEst || fullTokEst < 80) fullTokEst = 400; // typical sense dump floor

  return {
    ok: true,
    pilot: 'P58',
    here: here,
    law: pack.law,
    pack: pack,
    fidelity: {
      handoff_tok_est: toonTok,
      full_sense_tok_est: fullTokEst,
      save_vs_full:
        fullTokEst > 0
          ? Math.round((1 - toonTok / fullTokEst) * 1000) / 1000
          : null,
      law: 'handoff ≪ full dump · transfer densest not everything'
    },
    toon: packed && packed.ok
      ? {
          format: packed.format || 'toon',
          text: packed.text,
          tok_est: toonTok
        }
      : packed,
    note:
      'Use pack for re-enter; load pages_jit / skill JIT only. Do not re-prefill catalogs. Notes own memory.'
  };
}

function slimSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.slice(0, 4).map(function (s) {
    if (typeof s === 'string') {
      return { id: s.slice(0, 32) };
    }
    return {
      id: s.id || (s.child && s.did_prefix ? s.child + '__' + s.did_prefix : s.child || '?'),
      n: s.n_help != null ? s.n_help : undefined
    };
  });
}

function densestPagePaths(rootDir, forecastPage, links, here) {
  var ids = [];
  if (forecastPage) ids.push(String(forecastPage).replace(/\.md$/i, ''));
  (links || []).forEach(function (l) {
    var id = typeof l === 'string' ? l : l.id;
    if (id && ids.indexOf(id) < 0) ids.push(id);
  });
  // parent-local anchors first, then global transfer anchors
  var local = [];
  if (here === 'calendar_layers') local = ['calendar_layers', 'calendar_scales'];
  else if (here === 'research') local = ['research_latest', 'research_nvidia_kv_handoff', 'research_improve_p58'];
  else if (here === 'data') local = ['data_index', 'link_index'];
  else if (here === 'crystallize') local = ['hop0_digest', 'wiki_law'];
  local.forEach(function (id) {
    if (ids.indexOf(id) < 0) ids.push(id);
  });
  ['operate_close', 'research_latest', 'research_nvidia_kv_handoff', 'hop0_digest', 'operate_handoff'].forEach(
    function (id) {
      if (ids.indexOf(id) < 0) ids.push(id);
    }
  );
  var pagesDir = path.join(rootDir, 'store', 'pages');
  return ids.slice(0, 8).map(function (id) {
    var p = path.join(pagesDir, id + '.md');
    return {
      id: id,
      exists: fs.existsSync(p),
      path: 'store/pages/' + id + '.md'
    };
  });
}

function estimateTok(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

module.exports = {
  stripVolatile: stripVolatile,
  buildHandoff: buildHandoff
};
