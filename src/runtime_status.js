/**
 * P69 C1: status · listModalities · getDocs · samples densest (extracted).
 */
'use strict';

var samples = require('./samples');
var bytesMod = require('./bytes');
var tokenView = require('./token_view');
var codec = require('./codec');

function status(rootDir, registry, loop, history) {
  loop = loop || {};
  history = history || [];
  var tv = null;
  try {
    tv = tokenView.status(rootDir, { recent_n: 5, format: 'toon' });
  } catch (_e) { /* */ }
  return {
    ok: true,
    name: 'living-core',
    codec: codec.CODEC,
    modalities: Object.keys(registry),
    loop: Object.assign({}, loop),
    bytes: bytesMod.measure(rootDir),
    last_best: loop.last_best,
    history_n: history.length,
    samples_n: samples.readAll(rootDir).length,
    token_view: tv
      ? {
          format: tv.token_view,
          hidden: tv.hide && tv.hide.hop0_hidden,
          cold: tv.cold,
          samples_tok_est: tv.samples_pack && tv.samples_pack.tok_est,
          toon_vs_pretty:
            tv.samples_pack &&
            tv.samples_pack.compare &&
            tv.samples_pack.compare.toon_vs_pretty
        }
      : null
  };
}

function listModalities(rootDir, registry) {
  return Object.keys(registry).map(function (id) {
    var m = registry[id];
    var st = samples.stats(rootDir, id);
    return {
      id: m.id,
      parent_id: m.parent_id,
      status: m.status,
      last_j: m.last_j,
      goals_n: (m.goals || []).length,
      samples_n: st.n,
      mean_j: st.mean_j,
      help_rate: st.help_rate
    };
  });
}

function getDocs(registry, modalityId) {
  var m = registry[modalityId];
  if (!m) return { ok: false, error: 'unknown_modality' };
  return {
    ok: true,
    id: m.id,
    docs: {
      HOW: (m.docs.HOW || '').slice(0, 4000),
      WORKFLOW: (m.docs.WORKFLOW || '').slice(0, 4000),
      RESEARCH: (m.docs.RESEARCH || '').slice(0, 2000),
      GOALS: (m.docs.GOALS || '').slice(0, 2000),
      EXTERNALS: (m.docs.EXTERNALS || '').slice(0, 2000)
    }
  };
}

function samplesRecent(rootDir, n, opts) {
  opts = opts || {};
  return {
    ok: true,
    samples: samples.listRecent(rootDir, n || 10, {
      for_prompt: opts.for_prompt !== false,
      exclude_noise: opts.exclude_noise
    }),
    noise_filtered: opts.for_prompt !== false
  };
}

function samplesStats(rootDir, registry, modalityId) {
  if (!modalityId) {
    return {
      ok: true,
      by_modality: Object.keys(registry).map(function (id) {
        return Object.assign({ id: id }, samples.stats(rootDir, id));
      })
    };
  }
  return {
    ok: true,
    id: modalityId,
    stats: samples.stats(rootDir, modalityId)
  };
}

module.exports = {
  status: status,
  listModalities: listModalities,
  getDocs: getDocs,
  samplesRecent: samplesRecent,
  samplesStats: samplesStats
};
