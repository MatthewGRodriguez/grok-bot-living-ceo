/**
 * Outcome samples for effectiveness drift.
 * Append-only JSONL under store/pages/ — durable, attention-capped.
 * Stats use recency weighting so old farmed highs / old helps decay.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var SAMPLE_FILE = 'effectiveness_samples.jsonl';
var MAX_LINES_KEPT = 400;
var RECENT_WINDOW = 12;

function samplesPath(rootDir) {
  return path.join(rootDir, 'store', 'pages', SAMPLE_FILE);
}

function ensurePagesDir(rootDir) {
  var dir = path.join(rootDir, 'store', 'pages');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * P40 A2: smoke / thrash samples — durable log ok, not hop0/blend signal.
 * kind=smoke or child id matches *_smoke_* / probe_*_smoke_*
 */
function isNoiseSample(row) {
  if (!row) return false;
  var kind = String(row.kind || '').toLowerCase();
  if (kind === 'smoke' || kind === 'noise' || kind === 'test') return true;
  var child = String(row.child || '');
  if (/_smoke_/i.test(child) || /smoke_/i.test(child)) return true;
  if (/^probe_cli_git_smoke/i.test(child)) return true;
  // thrash pads / judge farm (not densest process signal)
  if (/^page_judge_farm/i.test(child)) return true;
  if (/^page_z_/i.test(child)) return true;
  // goal field marks smoke paths
  if (row.goal && /smoke|noise|test/i.test(String(row.goal))) return true;
  return false;
}

function inferKind(sample) {
  if (sample && sample.kind) return String(sample.kind).slice(0, 24);
  if (sample && isNoiseSample(sample)) return 'smoke';
  return 'outcome';
}

function readAll(rootDir) {
  var p = samplesPath(rootDir);
  if (!fs.existsSync(p)) return [];
  var text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch (_e) {
    return [];
  }
  var out = [];
  text.split('\n').forEach(function (line) {
    line = line.trim();
    if (!line) return;
    try {
      out.push(JSON.parse(line));
    } catch (_e2) { /* skip bad line */ }
  });
  return out;
}

/**
 * Soft-trim preferring clean signal rows (drop noise first).
 */
function softTrimRows(all, keepN) {
  keepN = keepN || 100;
  if (!all || all.length <= keepN) return all || [];
  var clean = [];
  var noise = [];
  all.forEach(function (r) {
    if (isNoiseSample(r)) noise.push(r);
    else clean.push(r);
  });
  if (clean.length >= keepN) return clean.slice(-keepN);
  // keep all clean + newest noise only if under keepN (rare)
  var need = keepN - clean.length;
  return clean.concat(noise.slice(-need));
}

/**
 * Append one outcome sample. Caps file length.
 */
function record(rootDir, sample) {
  ensurePagesDir(rootDir);
  var kind = inferKind(sample);
  var row = {
    at: sample.at || new Date().toISOString(),
    parent: sample.parent || 'host',
    child: sample.child,
    goal: sample.goal || null,
    j: typeof sample.j === 'number' ? sample.j : null,
    did_help: !!sample.did_help,
    did: sample.did || null,
    bytes_pressure: sample.bytes_pressure != null ? sample.bytes_pressure : null,
    status: sample.status || null,
    kind: kind,
    judge_score: sample.judge_score != null ? sample.judge_score : null,
    judge_reasons: sample.judge_reasons || null,
    j_raw: sample.j_raw != null ? sample.j_raw : null,
    j_n: sample.j_n != null ? sample.j_n : null,
    j_share: sample.j_share != null ? sample.j_share : null,
    layer_n: sample.layer_n != null ? sample.layer_n : null
  };
  if (!row.child) return { ok: false, error: 'child required' };

  var p = samplesPath(rootDir);
  fs.appendFileSync(p, JSON.stringify(row) + '\n', 'utf8');

  var all = readAll(rootDir);
  if (all.length > MAX_LINES_KEPT) {
    var keep = softTrimRows(all, Math.floor(MAX_LINES_KEPT * 0.75));
    fs.writeFileSync(
      p,
      keep.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n',
      'utf8'
    );
  }
  return { ok: true, sample: row };
}

/**
 * Aggregate stats for a modality id (optionally under a parent goal).
 * mean_j / help_rate are recency-weighted (newer samples count more).
 * Also exposes flat means for audit.
 */
function stats(rootDir, childId, opts) {
  opts = opts || {};
  // include_noise: default true for graduate/revoke of a specific child
  // (smoke probes need their own rows). Blend for live modalities is unaffected
  // because smoke children are separate ids. For host hop0 use listRecent clean.
  var all = readAll(rootDir).filter(function (s) {
    if (s.child !== childId) return false;
    if (opts.parent && s.parent !== opts.parent) return false;
    if (opts.exclude_noise && isNoiseSample(s)) return false;
    return true;
  });
  var n = all.length;
  if (!n) {
    return {
      n: 0,
      mean_j: null,
      help_rate: null,
      mean_j_flat: null,
      help_rate_flat: null,
      mean_j_recent: null,
      help_rate_recent: null,
      last_j: null,
      last_help: null,
      recent: []
    };
  }

  // Flat (all-time)
  var sumJ = 0;
  var jCount = 0;
  var helps = 0;
  all.forEach(function (s) {
    if (typeof s.j === 'number' && isFinite(s.j)) {
      sumJ += s.j;
      jCount++;
    }
    if (s.did_help) helps++;
  });
  var meanFlat = jCount ? sumJ / jCount : null;
  var helpFlat = helps / n;

  // Recency-weighted over full series (exponential, half-life ~6 samples from end)
  var halfLife = opts.halfLife != null ? opts.halfLife : 6;
  var wSum = 0;
  var wJ = 0;
  var wJsum = 0;
  var wHelp = 0;
  for (var i = 0; i < n; i++) {
    var age = n - 1 - i; // 0 = newest
    var w = Math.exp(-age / halfLife);
    wSum += w;
    if (typeof all[i].j === 'number' && isFinite(all[i].j)) {
      wJ += w * all[i].j;
      wJsum += w;
    }
    if (all[i].did_help) wHelp += w;
  }
  var meanW = wJsum > 0 ? wJ / wJsum : null;
  var helpW = wSum > 0 ? wHelp / wSum : null;

  // Recent window (last RECENT_WINDOW) flat — for graduation honesty
  var window = all.slice(-RECENT_WINDOW);
  var rSum = 0;
  var rN = 0;
  var rHelp = 0;
  window.forEach(function (s) {
    if (typeof s.j === 'number' && isFinite(s.j)) {
      rSum += s.j;
      rN++;
    }
    if (s.did_help) rHelp++;
  });
  var meanRecent = rN ? rSum / rN : null;
  var helpRecent = window.length ? rHelp / window.length : null;

  var last = all[all.length - 1];
  return {
    n: n,
    // Primary fields used by blend / graduate: recency-weighted
    mean_j: meanW,
    help_rate: helpW,
    mean_j_flat: meanFlat,
    help_rate_flat: helpFlat,
    mean_j_recent: meanRecent,
    help_rate_recent: helpRecent,
    last_j: last.j,
    last_help: last.did_help,
    recent: all.slice(-5)
  };
}

/**
 * Blend author prior with sample mean (recency-weighted).
 * Low help_rate after enough samples actively downranks.
 */
function blend(prior, st, opts) {
  opts = opts || {};
  var p = Number(prior);
  if (!isFinite(p)) p = 0.5;
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  if (!st || !st.n || st.mean_j == null) return p;

  var maxW = opts.maxWeight != null ? opts.maxWeight : 0.7;
  var halfLife = opts.halfLife != null ? opts.halfLife : 4;
  var w = maxW * (1 - Math.exp(-st.n / halfLife));
  var mean = st.mean_j;
  if (st.help_rate != null) {
    mean = 0.65 * mean + 0.35 * st.help_rate;
    // Prefer recent window when it's clearly colder than weighted mean
    if (st.help_rate_recent != null && st.n >= 4 && st.help_rate_recent < st.help_rate) {
      mean = 0.5 * mean + 0.5 * (0.65 * (st.mean_j_recent != null ? st.mean_j_recent : mean) + 0.35 * st.help_rate_recent);
    }
    if (st.n >= 3 && st.help_rate < 0.35) {
      mean *= 0.5;
    }
    if (st.n >= 5 && st.help_rate_recent != null && st.help_rate_recent < 0.2) {
      mean *= 0.45; // active no-help streak
    }
  }
  var blended = (1 - w) * p + w * mean;
  if (blended < 0) blended = 0;
  if (blended > 1) blended = 1;
  return blended;
}

/**
 * Recent rows. opts.for_prompt / exclude_noise → drop smoke thrash (P40 A2).
 */
function listRecent(rootDir, n, opts) {
  n = n || 10;
  opts = opts || {};
  var all = readAll(rootDir);
  if (opts.for_prompt || opts.exclude_noise) {
    all = all.filter(function (s) {
      return !isNoiseSample(s);
    });
  }
  return all.slice(-n);
}

/**
 * One-shot purge of noise rows from JSONL (keeps clean signal).
 * Returns { ok, before, after, removed }.
 */
function purgeNoise(rootDir, opts) {
  opts = opts || {};
  var all = readAll(rootDir);
  var clean = all.filter(function (s) {
    return !isNoiseSample(s);
  });
  var removed = all.length - clean.length;
  if (removed <= 0 && !opts.force) {
    return { ok: true, before: all.length, after: all.length, removed: 0, note: 'no_noise' };
  }
  if (opts.apply !== false) {
    var p = samplesPath(rootDir);
    ensurePagesDir(rootDir);
    fs.writeFileSync(
      p,
      clean.map(function (r) {
        return JSON.stringify(r);
      }).join('\n') + (clean.length ? '\n' : ''),
      'utf8'
    );
  }
  return {
    ok: true,
    before: all.length,
    after: clean.length,
    removed: removed,
    applied: opts.apply !== false
  };
}

module.exports = {
  samplesPath: samplesPath,
  readAll: readAll,
  record: record,
  stats: stats,
  blend: blend,
  listRecent: listRecent,
  isNoiseSample: isNoiseSample,
  softTrimRows: softTrimRows,
  purgeNoise: purgeNoise,
  RECENT_WINDOW: RECENT_WINDOW
};
