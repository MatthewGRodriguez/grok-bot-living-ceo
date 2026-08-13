/**
 * P64 C1: enter + judge + sample densest (extracted from runtime best path).
 */
'use strict';

var bytesMod = require('./bytes');
var judge = require('./judge');
var samples = require('./samples');
var graduate = require('./graduate');
var modality = require('./modality');

function isProbeId(id) {
  return String(id || '').indexOf('probe_') === 0;
}

function pickNonProbe(ranked, preferId) {
  if (preferId && !isProbeId(preferId)) {
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].id === preferId) return preferId;
    }
  }
  for (var j = 0; j < ranked.length; j++) {
    if (!isProbeId(ranked[j].id)) return ranked[j].id;
  }
  return ranked[0] ? ranked[0].id : null;
}

/** P-joy: under joy, skip host when it would only host_tick thrash — prefer durable children. */
function pickJoyChild(ranked, preferId) {
  var skipHost = true;
  var ordered = [];
  if (preferId) {
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].id === preferId) ordered.push(ranked[i]);
    }
  }
  for (var j = 0; j < ranked.length; j++) {
    if (!preferId || ranked[j].id !== preferId) ordered.push(ranked[j]);
  }
  for (var k = 0; k < ordered.length; k++) {
    var id = ordered[k].id;
    if (skipHost && id === 'host') continue;
    return id;
  }
  return ordered[0] ? ordered[0].id : null;
}

/**
 * Enter one child, judge, sample, re-localize layer scores.
 * ctx: { rootDir, registry, joys, groupOpts, loop }
 */
function enterAndSample(ctx, parentId, childId, ranked) {
  var rootDir = ctx.rootDir;
  var registry = ctx.registry;
  var joys = ctx.joys;
  var groupOpts = ctx.groupOpts;
  var loop = ctx.loop || {};

  var entered = modality.enterChild(
    registry,
    parentId,
    joys,
    childId,
    typeof groupOpts === 'function' ? groupOpts() : groupOpts || {}
  );
  if (!entered.ok) return { ok: false, entered: entered };

  var bstat = bytesMod.measure(rootDir);
  var verdict = judge.judgeEnter(rootDir, {
    parent: parentId,
    child: childId,
    goal: loop.open_goal,
    self_helped: !!entered.helped,
    did: entered.did,
    j: entered.j
  });
  var sampleRaw = entered.j;
  if (verdict.did_help && sampleRaw < 0.4) sampleRaw = Math.min(1, sampleRaw + 0.08);
  if (!verdict.did_help && entered.helped) sampleRaw = Math.max(0, sampleRaw * 0.65);
  if (!verdict.did_help && !entered.helped) sampleRaw = Math.max(0, sampleRaw * 0.75);

  var n = ranked && ranked.length ? ranked.length : 1;
  var layerRows = (ranked || [{ id: childId, j: sampleRaw, status: entered.status }]).map(
    function (r) {
      if (r.id === childId) {
        return {
          id: r.id,
          j: sampleRaw,
          status: entered.status,
          did: entered.did,
          helped: verdict.did_help
        };
      }
      return {
        id: r.id,
        j: r.j_raw != null ? r.j_raw : r.j,
        status: r.status,
        did: r.did,
        helped: r.helped,
        judge: r.judge
      };
    }
  );
  var loc = modality.localizeLayer(layerRows);
  ranked = loc.ranked;
  var me = ranked.find(function (r) {
    return r.id === childId;
  }) || ranked[0];
  var judgeInfo = {
    score: verdict.score,
    did_help: verdict.did_help,
    reasons: verdict.reasons
  };
  if (me) {
    me.did = entered.did;
    me.helped = verdict.did_help;
    me.judge = judgeInfo;
  }

  var rec = samples.record(rootDir, {
    parent: parentId,
    child: childId,
    goal: loop.open_goal,
    j: me ? me.j : sampleRaw / n,
    j_raw: sampleRaw,
    j_n: me ? me.j_n : sampleRaw / n,
    j_share: me ? me.j_share : 1,
    layer_n: n,
    did_help: verdict.did_help,
    did: entered.did,
    bytes_pressure: bstat.pressure,
    status: entered.status,
    kind: /_smoke_|smoke_/i.test(String(childId)) ? 'smoke' : 'outcome',
    judge_score: verdict.score,
    judge_reasons: verdict.reasons
  });

  if (registry[childId]) registry[childId].last_j = me ? me.j : sampleRaw;

  var top = {
    id: childId,
    j: me ? me.j : sampleRaw / n,
    j_raw: sampleRaw,
    j_n: me ? me.j_n : sampleRaw / n,
    j_share: me ? me.j_share : 1,
    status: entered.status,
    did: entered.did,
    helped: verdict.did_help,
    judge: judgeInfo,
    layer: loc.layer
  };

  return {
    ok: true,
    entered: entered,
    top: top,
    sample: rec.sample || null,
    ranked: ranked,
    layer: loc.layer,
    graduation: graduate.evaluate(rootDir, registry, childId, { apply: false })
  };
}

/**
 * Diversity pick when host last-K is research|crystallize mono.
 * densestSession: [{child,help,j}] last-K
 */
function diversityPick(parentId, pickId, ranked, densestSession, memCritical) {
  if (parentId !== 'host' || memCritical || !ranked || ranked.length <= 2) {
    return { pickId: pickId, exploreNote: null };
  }
  try {
    var sess = densestSession || [];
    var monoPair =
      sess.length >= 2 &&
      sess.every(function (s) {
        return s.child === 'research' || s.child === 'crystallize';
      });
    var sameTwice =
      sess.length >= 2 &&
      sess[sess.length - 1].child === sess[sess.length - 2].child;
    var topIsRC = pickId === 'research' || pickId === 'crystallize';
    if (!(monoPair || sameTwice) || !topIsRC) {
      return { pickId: pickId, exploreNote: null };
    }
    var avoid = { research: true, crystallize: true };
    sess.slice(-3).forEach(function (s) {
      if (s.child) avoid[s.child] = true;
    });
    var divers = null;
    for (var di = 0; di < ranked.length; di++) {
      var rid = ranked[di].id;
      if (!avoid[rid] && !isProbeId(rid)) {
        divers = rid;
        break;
      }
    }
    if (!divers) {
      for (var dpi = 0; dpi < ranked.length; dpi++) {
        if (isProbeId(ranked[dpi].id)) {
          divers = ranked[dpi].id;
          break;
        }
      }
    }
    if (!divers) {
      for (var d2 = 0; d2 < ranked.length; d2++) {
        if (
          ranked[d2].id !== 'research' &&
          ranked[d2].id !== 'crystallize'
        ) {
          divers = ranked[d2].id;
          break;
        }
      }
    }
    if (divers && divers !== pickId) {
      return { pickId: divers, exploreNote: 'diversity_break_mono' };
    }
  } catch (_dv) { /* */ }
  return { pickId: pickId, exploreNote: null };
}

module.exports = {
  enterAndSample: enterAndSample,
  isProbeId: isProbeId,
  pickNonProbe: pickNonProbe,
  pickJoyChild: pickJoyChild,
  diversityPick: diversityPick
};
