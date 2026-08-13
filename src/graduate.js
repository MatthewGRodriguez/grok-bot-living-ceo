/**
 * Graduation gate: probe → testing → stable.
 * Can refuse even when j is high — samples, docs, bytes, re-enterability matter.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var samples = require('./samples');
var bytesMod = require('./bytes');
var invokeLog = require('./invoke_log');

var ORDER = { probe: 0, testing: 1, stable: 2, revoked: -1 };

/**
 * Evaluate whether a modality may advance one lifecycle step.
 * Does not mutate disk unless apply=true (caller applies).
 */
function evaluate(rootDir, registry, modalityId, opts) {
  opts = opts || {};
  var m = registry[modalityId];
  if (!m) {
    return { ok: false, error: 'unknown_modality', id: modalityId };
  }

  var status = m.status || 'probe';
  if (status === 'stable') {
    return {
      ok: true,
      id: modalityId,
      status: status,
      can_graduate: false,
      reason: 'already_stable',
      refused: false
    };
  }
  if (status === 'revoked') {
    return {
      ok: true,
      id: modalityId,
      status: status,
      can_graduate: false,
      reason: 'revoked',
      refused: true
    };
  }

  var target = status === 'probe' ? 'testing' : 'stable';
  var st = samples.stats(rootDir, modalityId);
  var bytes = bytesMod.measure(rootDir);
  var checks = [];
  var refuse = [];

  // --- docs / re-enterable ---
  var hasHow = !!(m.docs && m.docs.HOW && m.docs.HOW.trim().length > 40);
  var hasWorkflow = !!(m.docs && m.docs.WORKFLOW && m.docs.WORKFLOW.trim().length > 20);
  var hasGoals = (m.goals || []).length > 0;
  var hasExotelos = !!(
    m.docs &&
    m.docs.EXOTELOS &&
    m.docs.EXOTELOS.trim().length > 40
  );
  checks.push({ id: 'docs_how', pass: hasHow });
  checks.push({ id: 'docs_workflow', pass: hasWorkflow });
  checks.push({ id: 'docs_goals', pass: hasGoals });
  checks.push({ id: 'docs_exotelos', pass: hasExotelos });
  if (!hasHow || !hasWorkflow || !hasGoals) {
    refuse.push('docs_incomplete');
  }
  if (target === 'stable' && !hasExotelos) {
    refuse.push('docs_exotelos_missing');
  }
  var exoFaded = !!(
    m.exotelos &&
    m.exotelos.exotelos &&
    m.exotelos.exotelos.faded
  );
  checks.push({
    id: 'exotelos_may_fade',
    pass: true,
    faded: exoFaded,
    note: exoFaded
      ? 'faded_ok_primary_secondary_still_graduate'
      : 'tertiary_live_or_unset'
  });

  // --- samples / outcomes (recency-weighted + recent window for stable) ---
  var minN = target === 'testing' ? 1 : 3;
  // Samples store layer-local share j (often ~0.2–0.6 for winners) — bar is lower than raw-era 0.5
  var minMean = target === 'testing' ? 0.12 : 0.28;
  var minHelp = target === 'testing' ? 0.0 : 0.5;
  checks.push({ id: 'samples_n', pass: st.n >= minN, n: st.n, need: minN });
  if (st.n < minN) refuse.push('insufficient_samples');

  var meanUse = st.mean_j;
  if (st.mean_j != null) {
    checks.push({
      id: 'mean_j',
      pass: meanUse >= minMean,
      mean_j: meanUse,
      mean_j_flat: st.mean_j_flat,
      need: minMean
    });
    if (meanUse < minMean) refuse.push('mean_j_too_low');
  } else if (target === 'stable') {
    checks.push({ id: 'mean_j', pass: false, mean_j: null, need: minMean });
    refuse.push('mean_j_missing');
  }

  if (target === 'stable') {
    // Prefer recent window (last ~12) so early no-help noise cannot forever block
    // after the modality starts producing real densest help.
    var hr = st.help_rate != null ? st.help_rate : 0;
    var hrRecent = st.help_rate_recent != null ? st.help_rate_recent : hr;
    var helpOk = hrRecent >= minHelp || (hr >= minHelp && hrRecent >= minHelp * 0.6);
    checks.push({
      id: 'help_rate',
      pass: helpOk,
      help_rate: hr,
      help_rate_recent: hrRecent,
      need: minHelp,
      note: 'recent-primary'
    });
    if (!helpOk) refuse.push('help_rate_too_low');
  }

  // --- bytes ---
  var pressureOk = bytes.pressure < 0.9;
  checks.push({ id: 'bytes_pressure', pass: pressureOk, pressure: bytes.pressure });
  if (!pressureOk) refuse.push('bytes_pressure_high');

  // --- P8: external probes need intentional invoke evidence (Grok living_invoke) ---
  // Verify-only Best samples alone cannot graduate an app/cli probe to testing/stable.
  if (m.manifest && m.manifest.external && m.manifest.external.id) {
    var extId = m.manifest.external.id;
    var inv = invokeLog.statsForExternal(rootDir, extId);
    var needOk = target === 'testing' ? 1 : 2;
    var invOk = inv.ok_n >= needOk;
    checks.push({
      id: 'invoke_evidence',
      pass: invOk,
      external_id: extId,
      ok_n: inv.ok_n,
      need: needOk,
      note: 'P8 intentional invoke, not rank verify'
    });
    if (!invOk) refuse.push('no_invoke_evidence');
  }

  // --- modality-friendly outputs (stable only) ---
  if (target === 'stable') {
    var friendly = hasModalityFriendlyOutput(rootDir, m);
    checks.push({ id: 'modality_friendly_output', pass: friendly.ok, detail: friendly.detail });
    if (!friendly.ok) refuse.push('no_modality_friendly_output');
  }

  // High j alone is not enough — if refuse list empty but mean_j is suspiciously high
  // with zero help, stable path already fails help_rate.

  var can = refuse.length === 0;
  var result = {
    ok: true,
    id: modalityId,
    status: status,
    target: target,
    can_graduate: can,
    refused: !can,
    reasons: refuse,
    checks: checks,
    samples: {
      n: st.n,
      mean_j: st.mean_j,
      help_rate: st.help_rate
    },
    bytes: { pressure: bytes.pressure, est: bytes.est, cap: bytes.cap },
    note: can
      ? ('eligible for ' + status + ' → ' + target)
      : ('refused: ' + refuse.join(', '))
  };

  if (opts.apply && can) {
    result.applied = applyStatus(m, target);
  } else if (opts.apply && !can) {
    result.applied = false;
  }

  return result;
}

function hasModalityFriendlyOutput(rootDir, m) {
  // Pages under store/pages that mention this modality, or lambda produced exports
  var pagesDir = path.join(rootDir, 'store', 'pages');
  if (fs.existsSync(pagesDir)) {
    try {
      var files = fs.readdirSync(pagesDir);
      for (var i = 0; i < files.length; i++) {
        if (files[i].indexOf(m.id) >= 0) {
          return { ok: true, detail: 'page:' + files[i] };
        }
        // digest/research pages count for research/crystallize/data
        if (
          (m.id === 'research' || m.id === 'crystallize' || m.id === 'data') &&
          (files[i].indexOf('research') >= 0 ||
            files[i].indexOf('digest') >= 0 ||
            files[i].indexOf('page_') === 0)
        ) {
          return { ok: true, detail: 'page:' + files[i] };
        }
      }
    } catch (_e) { /* */ }
  }
  // External probes: verified path counts as addressable
  if (m.manifest && m.manifest.external && m.manifest.external.path) {
    if (fs.existsSync(m.manifest.external.path)) {
      return { ok: true, detail: 'external_path_exists' };
    }
  }
  // Craft/data/pages: any non-empty pages dir beyond samples file
  if (fs.existsSync(pagesDir)) {
    try {
      var n = fs.readdirSync(pagesDir).filter(function (f) {
        return f !== 'effectiveness_samples.jsonl' && !f.startsWith('.');
      }).length;
      if (n > 0 && (m.id === 'data' || m.id === 'craft' || m.id === 'pages' || m.id === 'samples')) {
        return { ok: true, detail: 'pages_n=' + n };
      }
    } catch (_e2) { /* */ }
  }
  var expDir = path.join(rootDir, 'store', 'exports');
  if (m.id === 'exports' && fs.existsSync(expDir)) {
    try {
      if (fs.existsSync(path.join(expDir, 'exports_index.md'))) {
        return { ok: true, detail: 'exports_index' };
      }
    } catch (_e3) { /* */ }
  }
  return { ok: false, detail: 'no_durable_output' };
}

function applyStatus(m, target) {
  m.status = target;
  if (!m.manifest) m.manifest = {};
  m.manifest.status = target;
  m.manifest.graduated_at = new Date().toISOString();
  try {
    var manPath = path.join(m.dir, 'MANIFEST.json');
    var raw = {};
    if (fs.existsSync(manPath)) {
      raw = JSON.parse(fs.readFileSync(manPath, 'utf8'));
    }
    raw.status = target;
    raw.graduated_at = m.manifest.graduated_at;
    fs.writeFileSync(manPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
    // Append RESEARCH note
    var researchPath = path.join(m.dir, 'docs', 'RESEARCH.md');
    var line =
      '\n## graduation ' + m.manifest.graduated_at +
      '\n- status → **' + target + '**\n';
    fs.appendFileSync(researchPath, line, 'utf8');
    if (m.docs) m.docs.RESEARCH = (m.docs.RESEARCH || '') + line;
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * List graduation eligibility for all non-stable modalities.
 */
function evaluateAll(rootDir, registry) {
  return Object.keys(registry)
    .filter(function (id) {
      var s = registry[id].status;
      return s === 'probe' || s === 'testing';
    })
    .map(function (id) {
      return evaluate(rootDir, registry, id, { apply: false });
    });
}

/**
 * Revoke noise: probes/testing that burn samples without help, or sit dead.
 * Stable host/data never revoked by this path.
 */
function evaluateRevoke(rootDir, registry, modalityId, opts) {
  opts = opts || {};
  var m = registry[modalityId];
  if (!m) return { ok: false, error: 'unknown_modality' };
  if (m.id === 'host' || m.id === 'data') {
    return {
      ok: true,
      id: modalityId,
      can_revoke: false,
      reason: 'protected_bootstrap'
    };
  }
  if (m.status === 'revoked') {
    return { ok: true, id: modalityId, can_revoke: false, reason: 'already_revoked' };
  }
  if (m.status === 'stable') {
    return { ok: true, id: modalityId, can_revoke: false, reason: 'stable_manual_only' };
  }

  var st = samples.stats(rootDir, modalityId);
  var reasons = [];
  // Enough evidence of uselessness
  if (st.n >= 4 && st.help_rate != null && st.help_rate < 0.25) {
    reasons.push('low_help_rate');
  }
  if (st.n >= 5 && st.mean_j != null && st.mean_j < 0.3) {
    reasons.push('low_mean_j');
  }
  // Scaffolded app/cli probes with zero helpful samples after tries
  if (
    m.manifest &&
    m.manifest.external &&
    st.n >= 3 &&
    (st.help_rate == null || st.help_rate === 0)
  ) {
    reasons.push('external_probe_no_help');
  }

  var can = reasons.length > 0;
  var result = {
    ok: true,
    id: modalityId,
    status: m.status,
    can_revoke: can,
    reasons: reasons,
    samples: { n: st.n, mean_j: st.mean_j, help_rate: st.help_rate },
    note: can ? ('eligible revoke: ' + reasons.join(', ')) : 'keep'
  };

  if (opts.apply && can) {
    result.applied = applyStatus(m, 'revoked');
  } else if (opts.apply && !can) {
    result.applied = false;
  }
  return result;
}

function evaluateRevokeAll(rootDir, registry, opts) {
  opts = opts || {};
  return Object.keys(registry)
    .filter(function (id) {
      return id !== 'host' && registry[id].status !== 'revoked';
    })
    .map(function (id) {
      return evaluateRevoke(rootDir, registry, id, opts);
    })
    .filter(function (r) {
      return opts.only_eligible ? r.can_revoke : true;
    });
}

/**
 * Noise audit: graduate candidates + revoke candidates + probe counts.
 */
function audit(rootDir, registry) {
  var grad = evaluateAll(rootDir, registry);
  var rev = evaluateRevokeAll(rootDir, registry, {});
  var byStatus = {};
  Object.keys(registry).forEach(function (id) {
    var s = registry[id].status || 'probe';
    byStatus[s] = (byStatus[s] || 0) + 1;
  });
  return {
    ok: true,
    by_status: byStatus,
    graduate_eligible: grad.filter(function (g) { return g.can_graduate; }),
    graduate_refused: grad.filter(function (g) { return g.refused; }),
    revoke_eligible: rev.filter(function (r) { return r.can_revoke; }),
    revoke_keep: rev.filter(function (r) { return !r.can_revoke; }).map(function (r) {
      return { id: r.id, reason: r.reason || r.note };
    })
  };
}

module.exports = {
  evaluate: evaluate,
  evaluateAll: evaluateAll,
  evaluateRevoke: evaluateRevoke,
  evaluateRevokeAll: evaluateRevokeAll,
  audit: audit,
  ORDER: ORDER
};
