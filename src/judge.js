/**
 * Parent-goal judge — honest did_help beyond lambda self-report.
 * Host open goal: live attention-packed process ranking by effectiveness under bytes.
 * P43/P60 A6: same-path rewrite without structural delta is not help (anti-farm).
 * Farm streak + volatile strip densest (timestamps · last_best · debt labels).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var bytesMod = require('./bytes');

var WRITE_FP_FILE = 'write_fp.json';
var FARM_STREAK_HARD = 2;

/**
 * Judge whether an enter advanced the parent goal.
 * @returns {{ did_help: boolean, score: number, reasons: string[], self_helped: boolean }}
 */
function judgeEnter(rootDir, opts) {
  opts = opts || {};
  var childId = opts.child;
  var parentId = opts.parent || 'host';
  var goal = opts.goal || 'host:live';
  var selfHelped = !!opts.self_helped;
  var did = opts.did || '';
  var j = typeof opts.j === 'number' ? opts.j : null;

  var reasons = [];
  var score = 0;
  var max = 0;

  function add(points, maxPts, ok, reason) {
    max += maxPts;
    if (ok) {
      score += points;
      reasons.push('+' + reason);
    } else {
      reasons.push('-' + reason);
    }
  }

  // 1) Durable write that exists (not just claimed)
  var durable = detectDurableOutput(rootDir, childId, did);
  add(0.35, 0.35, durable.ok, durable.detail || 'durable_output');

  // 2) Content densest-ish: non-trivial size, has structure markers
  var quality = durable.ok ? contentQuality(durable.path) : { ok: false, detail: 'no_path' };
  add(0.2, 0.2, quality.ok, quality.detail || 'content_quality');

  // 3) Self-report agrees with evidence (penalize farmed helped=true with no file)
  if (selfHelped && !durable.ok) {
    add(0, 0.15, false, 'self_help_without_durable');
  } else if (selfHelped && durable.ok) {
    add(0.15, 0.15, true, 'self_help_corroborated');
  } else if (!selfHelped && durable.ok) {
    add(0.1, 0.15, true, 'durable_despite_modest_self');
  } else {
    add(0, 0.15, false, 'no_self_no_durable');
  }

  // 4) Bytes pressure not harmed badly
  var b = bytesMod.measure(rootDir);
  var bytesOk = b.pressure < 0.85;
  add(0.1, 0.1, bytesOk, bytesOk ? 'bytes_ok' : 'bytes_pressure_high');

  // 5) Goal alignment heuristics for parent goal
  var goalOk = goalAlign(parentId, goal, childId, durable, did);
  add(0.2, 0.2, goalOk.ok, goalOk.detail);

  // 6) P43/P60 A6: structural delta on same path (timestamp-only thrash ≠ help)
  var delta = { ok: true, detail: 'no_file_delta_check' };
  if (durable.ok && durable.path) {
    delta = structuralDelta(rootDir, durable, {
      child: childId,
      did: did,
      persist: opts.persist_fp !== false
    });
    add(0.2, 0.2, delta.ok, delta.detail || 'struct_delta');
    // P60: farm streak — repeated same-path no-delta hard fail
    if (delta.farm_streak != null && delta.farm_streak >= FARM_STREAK_HARD) {
      add(0, 0.15, false, 'farm_streak:' + delta.farm_streak);
    } else if (delta.ok) {
      add(0.05, 0.15, true, 'farm_streak_clear');
    } else {
      add(0, 0.15, false, 'farm_streak_pending');
    }
  }

  var ratio = max > 0 ? score / max : 0;
  // Threshold: need clear majority of evidence
  var didHelp = ratio >= 0.55 && durable.ok;

  // Empty craft spam: file exists but quality failed → no help
  if (durable.ok && !quality.ok) didHelp = false;

  // P43: same-path rewrite with no densest structural change → no help
  if (durable.ok && delta && delta.ok === false) didHelp = false;

  // P60: hard farm streak (digest thrash loops)
  if (delta && delta.farm_streak >= FARM_STREAK_HARD) didHelp = false;

  // Known thrash surfaces: hop0_digest / research_latest need real delta
  if (
    durable.ok &&
    durable.path &&
    /(hop0_digest|research_latest)\.md$/i.test(path.basename(durable.path)) &&
    delta &&
    delta.ok === false
  ) {
    didHelp = false;
    if (reasons.indexOf('-thrash_surface') < 0) reasons.push('-thrash_surface');
  }

  return {
    did_help: didHelp,
    score: Math.round(ratio * 1000) / 1000,
    reasons: reasons,
    self_helped: selfHelped,
    durable: durable,
    structural_delta: delta,
    j: j,
    child: childId,
    parent: parentId,
    goal: goal
  };
}

/**
 * Fingerprint page body ignoring volatile timestamps / meta lines.
 * P60: strip debt/last_best/parent_j so meta-only rewrites ≠ help.
 */
function contentFingerprint(text) {
  var s = String(text || '')
    .replace(/^- at:.*$/gim, '')
    .replace(/^- last_best_before:.*$/gim, '')
    .replace(/^- parent_j:.*$/gim, '')
    .replace(/^- open_goal:.*$/gim, '')
    .replace(/^- debt:.*$/gim, '')
    .replace(/densified_at:\s*\S+/gi, 'densified_at:T')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g, 'T')
    .replace(/\b0\.\d{4,}\b/g, '0.j') // micro-j thrash
    .replace(/\s+/g, ' ')
    .trim();
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return {
    hash: (h >>> 0).toString(16),
    len: s.length
  };
}

function writeFpPath(rootDir) {
  return path.join(rootDir, 'store', 'pages', WRITE_FP_FILE);
}

/**
 * Compare durable write to last fingerprint for that basename.
 * First write or real body change → ok. Same stripped body → farm.
 */
function structuralDelta(rootDir, durable, opts) {
  opts = opts || {};
  if (!durable || !durable.path) {
    return { ok: true, detail: 'no_path_skip' };
  }
  var key = path.basename(durable.path);
  var text = '';
  try {
    text = fs.readFileSync(durable.path, 'utf8');
  } catch (_e) {
    return { ok: false, detail: 'unreadable_for_delta' };
  }
  var fp = contentFingerprint(text);
  var store = { project: 'living-core', law: 'P43 anti-farm write fingerprints', files: {} };
  var p = writeFpPath(rootDir);
  try {
    if (fs.existsSync(p)) {
      var raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (raw && raw.files) store = raw;
      else if (raw && typeof raw === 'object') store.files = raw;
    }
  } catch (_e2) { /* */ }
  if (!store.files) store.files = {};

  var prev = store.files[key];
  var ok = true;
  var detail = 'struct_delta:' + key;
  var farmStreak = 0;
  if (prev && prev.hash === fp.hash && prev.len === fp.len) {
    ok = false;
    detail = 'same_path_no_delta:' + key;
    farmStreak = (prev.farm_streak || 0) + 1;
  }

  if (opts.persist !== false) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      store.files[key] = {
        hash: fp.hash,
        len: fp.len,
        at: new Date().toISOString(),
        child: opts.child || null,
        did: opts.did ? String(opts.did).slice(0, 64) : null,
        farm_streak: ok ? 0 : farmStreak
      };
      store.at = new Date().toISOString();
      store.law = 'P60 anti-farm write fingerprints · farm_streak';
      fs.writeFileSync(p, JSON.stringify(store, null, 2) + '\n', 'utf8');
    } catch (_w) { /* */ }
  }

  return {
    ok: ok,
    detail: detail,
    key: key,
    hash: fp.hash,
    len: fp.len,
    prev_hash: prev && prev.hash,
    farm_streak: farmStreak
  };
}

function detectDurableOutput(rootDir, childId, did) {
  var pages = path.join(rootDir, 'store', 'pages');
  var wrote = null;
  var m = String(did || '').match(/(?:^|\+)wrote:([^\s+]+)/);
  if (m) wrote = m[1];
  if (wrote) {
    // densest: modalities sometimes append :bytes or :n=K after filename
    wrote = String(wrote).replace(/\.(md|svg|json|html):\d+$/i, '.$1')
      .replace(/\.(md|svg|json|html):n=\d+$/i, '.$1');
  }

  if (wrote) {
    // basename or relative under pages / exports
    var candidates = [
      path.join(pages, wrote),
      path.join(rootDir, 'store', 'exports', wrote),
      path.join(rootDir, wrote)
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (fs.existsSync(candidates[i]) && fs.statSync(candidates[i]).isFile()) {
        return { ok: true, path: candidates[i], detail: 'wrote_exists:' + path.basename(candidates[i]) };
      }
    }
    // ensure_store+data_index style
    if (did.indexOf('data_index') >= 0) {
      var idx = path.join(pages, 'data_index.md');
      if (fs.existsSync(idx)) {
        return { ok: true, path: idx, detail: 'data_index' };
      }
    }
    return { ok: false, detail: 'wrote_missing:' + wrote };
  }

  if (
    did &&
    (did.indexOf('store_already_healthy') >= 0 ||
      did.indexOf('research_unchanged') >= 0 ||
      did.indexOf('digest_unchanged') >= 0 ||
      did.indexOf('craft_soft_cap') >= 0 ||
      did.indexOf('pages_current') >= 0 ||
      did.indexOf('exports_current') >= 0 ||
      did.indexOf('samples_under_cap') >= 0 ||
      did.indexOf('calendar_current') >= 0)
  ) {
    return { ok: false, detail: 'no_densest_change' };
  }
  // trimmed_samples / multi-part did with wrote:
  if (did && did.indexOf('trimmed_samples:') === 0) {
    var sp = path.join(rootDir, 'store', 'pages', 'effectiveness_samples.jsonl');
    if (fs.existsSync(sp)) {
      return { ok: true, path: sp, detail: 'samples_trimmed' };
    }
  }
  if (did && did.indexOf('rm:') >= 0) {
    // prune counts as densest hygiene under data
    var di = path.join(pages, 'data_index.md');
    if (fs.existsSync(di)) return { ok: true, path: di, detail: 'pages_pruned' };
  }
  if (did && did.indexOf('ensure_store') >= 0) {
    var di = path.join(pages, 'data_index.md');
    if (fs.existsSync(di)) return { ok: true, path: di, detail: 'ensure_store' };
  }

  if (did && did.indexOf('verified:') === 0) {
    // probe verify alone is weak help for host:live unless path exists
    return { ok: false, detail: 'verify_only_not_goal_progress' };
  }

  // Fallback: known pages for known modalities
  var known = {
    research: 'research_latest.md',
    crystallize: 'hop0_digest.md',
    data: 'data_index.md'
  };
  if (known[childId]) {
    var p = path.join(pages, known[childId]);
    if (fs.existsSync(p)) {
      // only count if recently touched (2 min) — else stale claim
      try {
        var age = Date.now() - fs.statSync(p).mtimeMs;
        if (age < 120000) {
          return { ok: true, path: p, detail: 'recent_page:' + known[childId] };
        }
      } catch (_e) { /* */ }
    }
  }

  return { ok: false, detail: 'no_durable_output' };
}

function contentQuality(filePath) {
  try {
    var text = fs.readFileSync(filePath, 'utf8');
    var len = text.trim().length;
    if (len < 40) return { ok: false, detail: 'too_short' };
    if (len > 200000) return { ok: false, detail: 'too_huge' };
    // P21: densest SVG surface export is structured vector (not markdown)
    if (/\.svg$/i.test(filePath) || text.indexOf('<svg') >= 0) {
      if (len < 80) return { ok: false, detail: 'svg_too_short' };
      var svgOk =
        text.indexOf('<svg') >= 0 &&
        (text.indexOf('living') >= 0 || text.indexOf('densest') >= 0 || text.indexOf('viewBox') >= 0);
      return svgOk
        ? { ok: true, detail: 'svg_surface_len=' + len }
        : { ok: false, detail: 'svg_shallow' };
    }
    var hasHeading = /^#\s+/m.test(text);
    var hasStructure = hasHeading || text.indexOf('- ') >= 0 || text.indexOf(':') >= 0;
    if (!hasStructure) return { ok: false, detail: 'unstructured' };
    // Farmed empty-ish: mostly whitespace / repeated boilerplate with no densest fields
    var densestHints =
      text.indexOf('open_goal') >= 0 ||
      text.indexOf('densest') >= 0 ||
      text.indexOf('law') >= 0 ||
      text.indexOf('re-enter') >= 0 ||
      text.indexOf('pages:') >= 0 ||
      text.indexOf('hop0') >= 0 ||
      text.indexOf('at:') >= 0 ||
      text.indexOf('living_invoke') >= 0 ||
      text.indexOf('external:') >= 0;
    if (!densestHints && len < 120) return { ok: false, detail: 'shallow' };
    return { ok: true, detail: 'structured_len=' + len };
  } catch (_e) {
    return { ok: false, detail: 'unreadable' };
  }
}

function goalAlign(parentId, goal, childId, durable, did) {
  // host:live wants attention memory, ranking signal, densest re-entry — not app opens
  var g = String(goal || '');
  if (parentId === 'host' || g.indexOf('host') >= 0 || g.indexOf('live') >= 0) {
    if (childId === 'research' || childId === 'crystallize' || childId === 'data') {
      return { ok: durable.ok, detail: durable.ok ? 'memory_surface' : 'no_memory_write' };
    }
    if (childId === 'craft') {
      return {
        ok: durable.ok && String(did).indexOf('wrote:page_') === 0,
        detail: durable.ok ? 'new_structured_object' : 'no_craft_page'
      };
    }
    if (String(childId).indexOf('probe_') === 0) {
      // P21: densest export surface without open -a counts as host-goal help
      var d = String(did || '');
      var surfaceWrite =
        durable.ok &&
        d.indexOf('wrote:') === 0 &&
        (d.indexOf('living_') >= 0 ||
          (durable.path && String(durable.path).indexOf('exports') >= 0));
      if (surfaceWrite) {
        return { ok: true, detail: 'probe_surface_export' };
      }
      // bare verify still not host goal
      return { ok: false, detail: 'probe_not_host_goal' };
    }
  }
  // data layer: pages / exports / samples advance durable store
  if (parentId === 'data' || g.indexOf('data:') === 0) {
    if (childId === 'pages' || childId === 'exports' || childId === 'samples') {
      return {
        ok: durable.ok,
        detail: durable.ok ? 'data_child_durable' : 'data_child_no_write'
      };
    }
  }
  return { ok: durable.ok, detail: 'generic_align' };
}

module.exports = {
  judgeEnter: judgeEnter,
  detectDurableOutput: detectDurableOutput,
  contentQuality: contentQuality,
  structuralDelta: structuralDelta,
  contentFingerprint: contentFingerprint,
  writeFpPath: writeFpPath
};
