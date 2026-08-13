/**
 * Token-facing views + attention layer hide plan (P30–P32 pilot).
 * Dual boundary: disk JSON/md · prompt TOON/densest · cold zstd/gzip.
 */
'use strict';

var path = require('path');
var fs = require('fs');
var toon = require('./toon');
var cold = require('./cold');
var samples = require('./samples');
var bytes = require('./bytes');

/** Attention layers L0–L5 densest */
var LAYERS = [
  { id: 'L0_hop0', always: true, note: 'attention-live hop0' },
  { id: 'L1_law', always: false, note: 'wiki law / skills' },
  { id: 'L2_working', always: false, note: 'linked pages working set' },
  { id: 'L3_tails', always: false, note: 'session/invoke/samples last-K' },
  { id: 'L4_raw', always: false, note: 'store/raw never default' },
  { id: 'L5_archive', always: false, note: 'store/cold compressed' }
];

/**
 * Decide which layers are hidden under pressure.
 * opts: { free_gb, bytes_pressure, force_hide }
 */
function hidePlan(opts) {
  opts = opts || {};
  var free = opts.free_gb;
  var bp = Number(opts.bytes_pressure) || 0;
  var pressure =
    opts.pressure ||
    (free != null && free < 0.2
      ? 'critical'
      : free != null && free < 0.4
        ? 'high'
        : free != null && free < 1
          ? 'med'
          : bp > 0.85
            ? 'high'
            : bp > 0.6
              ? 'med'
              : 'ok');
  var hidden = [];
  // Always hide raw from default prompt
  hidden.push('L4_raw');
  if (pressure === 'med' || pressure === 'high' || pressure === 'critical') {
    hidden.push('L5_archive');
  }
  if (pressure === 'high' || pressure === 'critical') {
    // tails still densest last-K but mark cold prefer
    hidden.push('L5_archive');
  }
  if (pressure === 'critical') {
    hidden.push('L2_working'); // only hop0 + law densest
  }
  // unique
  var seen = Object.create(null);
  hidden = hidden.filter(function (h) {
    if (seen[h]) return false;
    seen[h] = 1;
    return true;
  });
  var visible = LAYERS.map(function (L) {
    return L.id;
  }).filter(function (id) {
    return hidden.indexOf(id) < 0;
  });
  // L0 always visible
  if (visible.indexOf('L0_hop0') < 0) visible.unshift('L0_hop0');
  return {
    pressure: pressure,
    hidden: hidden,
    visible: visible,
    free_gb: free != null ? free : null,
    bytes_pressure: bp,
    hop0_hidden: hidden.join(',') || '—',
    hop0_visible: visible.slice(0, 4).join(',')
  };
}

/**
 * Pack samples (or any rows) for LLM: format toon|json|json_pretty
 */
function packRows(rows, opts) {
  opts = opts || {};
  var format = String(opts.format || 'toon').toLowerCase();
  var name = opts.name || 'samples';
  rows = Array.isArray(rows) ? rows : [];
  if (format === 'json' || format === 'json_compact') {
    var c = JSON.stringify(rows);
    return {
      ok: true,
      format: 'json_compact',
      text: c,
      tok_est: toon.estimateTokens(c),
      n: rows.length
    };
  }
  if (format === 'json_pretty' || format === 'pretty') {
    var p = JSON.stringify(rows, null, 2);
    return {
      ok: true,
      format: 'json_pretty',
      text: p,
      tok_est: toon.estimateTokens(p),
      n: rows.length
    };
  }
  var enc = toon.encode(rows, { name: name });
  return {
    ok: enc.ok,
    format: enc.format,
    form: enc.form,
    text: enc.text,
    tok_est: enc.ok ? toon.estimateTokens(enc.text) : null,
    n: rows.length,
    compare: toon.compareViews(rows, { name: name }),
    note: enc.note
  };
}

/**
 * Densest status for hop0 + MCP pilot.
 */
function status(rootDir, opts) {
  opts = opts || {};
  var b = bytes.measure(rootDir);
  var memFree = opts.free_gb;
  if (memFree == null) {
    try {
      var os = require('os');
      memFree = os.freemem() / (1024 * 1024 * 1024);
    } catch (_e) { /* */ }
  }
  var plan = hidePlan({
    free_gb: memFree,
    bytes_pressure: b.pressure
  });
  var coldList = cold.listCold(rootDir);
  // P40 A2: hop0/prompt packs exclude smoke thrash
  var recent = samples.listRecent
    ? samples.listRecent(rootDir, opts.recent_n || 8, { for_prompt: true })
    : [];
  // densest rows for TOON (strip heavy fields)
  var slim = recent.map(function (r) {
    return {
      at: r.at,
      parent: r.parent,
      child: r.child,
      j: r.j,
      help: r.did_help ? 1 : 0,
      status: r.status
    };
  });
  var packed = packRows(slim, { format: opts.format || 'toon', name: 'samples' });
  return {
    ok: true,
    pilot: 'P30-P33',
    law: 'disk JSON · prompt TOON/densest · cold zstd|gzip · hide≠delete',
    token_view: packed.format || 'toon',
    layers: LAYERS,
    hide: plan,
    cold: { n: coldList.n, hop0: coldList.hop0, algo: cold.pickAlgo() },
    samples_pack: {
      n: slim.length,
      format: packed.format,
      tok_est: packed.tok_est,
      compare: packed.compare,
      text_preview: packed.text ? packed.text.slice(0, 400) : null
    },
    bytes: b,
    hop0: {
      token_view: packed.format || 'toon',
      hidden: plan.hop0_hidden,
      cold: coldList.hop0,
      tok_est_samples: packed.tok_est
    }
  };
}

/**
 * Optional: archive oldest half of samples when over soft cap (pilot).
 * Does not delete live file unless opts.apply_trim.
 */
function maybeArchiveSamples(rootDir, opts) {
  opts = opts || {};
  var all = samples.readAll ? samples.readAll(rootDir) : [];
  // samples may not export readAll - use listRecent large
  if (!all.length) {
    try {
      all = samples.listRecent(rootDir, 9999);
    } catch (_e) {
      all = [];
    }
  }
  var cap = opts.cap != null ? opts.cap : 400;
  if (all.length <= cap) {
    return { ok: true, archived: false, n: all.length, note: 'under_cap' };
  }
  var cut = Math.floor(all.length * 0.25);
  var old = all.slice(0, cut);
  var keep = all.slice(cut);
  var arch = cold.archiveSamplesTail(rootDir, old, { name: 'samples_old' });
  if (!arch.ok) return arch;
  if (opts.apply_trim) {
    var p = samples.samplesPath(rootDir);
    fs.writeFileSync(
      p,
      keep.map(function (r) {
        return JSON.stringify(r);
      }).join('\n') + '\n',
      'utf8'
    );
  }
  return {
    ok: true,
    archived: true,
    cold: arch.meta,
    hop0: arch.hop0,
    kept: keep.length,
    archived_n: old.length,
    trimmed: !!opts.apply_trim
  };
}

module.exports = {
  LAYERS: LAYERS,
  hidePlan: hidePlan,
  packRows: packRows,
  status: status,
  maybeArchiveSamples: maybeArchiveSamples,
  toon: toon,
  cold: cold
};
