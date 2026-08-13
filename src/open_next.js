/**
 * P47 C1 / P15 / P58: densest open_next line (not full roadmap dump).
 * Parent-local: any modality entrypoint, not host-only chrome.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var debt = require('./debt');
var exotelos = require('./exotelos');

function modalityBonds(registry, parentId) {
  var m = registry && registry[parentId];
  return (m && m.bonds) || [];
}

function softBondLine(line, registry, parentId, openGoal) {
  return exotelos.appendBondHint(line, modalityBonds(registry, parentId), {
    open_goal: openGoal || '',
    open_next: line
  });
}

function densestOpenNext(rootDir, registry, parentId, opts) {
  registry = registry || {};
  parentId = parentId || 'host';
  opts = opts || {};
  var openGoal = opts.open_goal || '';

  // --- parent-local branches (P58) ---
  if (parentId === 'data') {
    try {
      var dd = debt.dataDebt(rootDir);
      if (dd && dd.has) {
        return ('data_debt ' + (dd.reasons[0] || 'store') + ' · Best pages').slice(0, 96);
      }
    } catch (_d) { /* */ }
    return softBondLine(
      'operate_data · ensure_store · rankCycle parent=data',
      registry,
      parentId,
      openGoal
    );
  }
  if (parentId === 'calendar_layers') {
    try {
      var ccd = debt.calendarDebt(rootDir);
      if (ccd && ccd.has) {
        return (
          'calendar_debt ' + (ccd.reasons[0] || 'map') + ' · rewrite densest map'
        ).slice(0, 96);
      }
    } catch (_c0) { /* */ }
    return softBondLine(
      'calendar_current · densest map · money SoT sheet',
      registry,
      parentId,
      openGoal
    );
  }
  if (parentId === 'research') {
    return softBondLine(
      'research densest · wrote research_latest · no roadmap farm',
      registry,
      parentId,
      openGoal
    );
  }
  if (parentId === 'crystallize') {
    return softBondLine(
      'crystallize densest · hop0_digest · wiki law',
      registry,
      parentId,
      openGoal
    );
  }
  if (parentId !== 'host') {
    // generic non-host parent: rank under this layer if it has children
    var kids = 0;
    try {
      Object.keys(registry).forEach(function (id) {
        if (
          registry[id] &&
          registry[id].parent_id === parentId &&
          registry[id].status !== 'revoked'
        ) {
          kids++;
        }
      });
    } catch (_k) { /* */ }
    if (kids > 0) {
      return softBondLine(
        'rankCycle parent=' + parentId + ' · densest child help',
        registry,
        parentId,
        openGoal
      );
    }
    // P59 leaf: no children — return host densest (probes, pure writers)
    return softBondLine(
      'here=' + parentId + ' · rest · return host hop0',
      registry,
      parentId,
      openGoal
    );
  }

  // --- host densest (global operate law) ---
  // debt / REVIEW never take bond suffix (floors dominate)
  try {
    var cd = debt.calendarDebt(rootDir);
    if (cd && cd.has) {
      return ('calendar_debt ' + (cd.reasons[0] || 'map') + ' · Best calendar_layers').slice(0, 96);
    }
  } catch (_c) { /* */ }
  try {
    var rankingReview = require('./ranking_review');
    var rv = rankingReview.buildReview(null, {});
    if (rv && rv.dirty) {
      var code =
        (rv.findings && rv.findings[0] && rv.findings[0].code) || 'dirty';
      return ('REVIEW ' + code + ' · living_ranking review/approve').slice(0, 96);
    }
  } catch (_r) { /* */ }
  // P60: research densest debt (after calendar + REVIEW)
  try {
    var rd = debt.researchDebt && debt.researchDebt(rootDir);
    if (rd && rd.has) {
      return (
        'research_debt ' + (rd.reasons[0] || 'latest') + ' · Best research'
      ).slice(0, 96);
    }
  } catch (_rd) { /* */ }
  try {
    var rankToon = path.join(rootDir, 'store', 'pages', 'operate_ranking_toon.md');
    var tokPilot = path.join(rootDir, 'store', 'pages', 'operate_token_pilot.md');
    var opClose = path.join(rootDir, 'store', 'pages', 'operate_close.md');
    if (fs.existsSync(rankToon) && fs.existsSync(opClose)) {
      return softBondLine(
        'operate_close · rankCycle · sheet SoT · no roadmap farm',
        registry,
        parentId,
        openGoal
      );
    }
    if (fs.existsSync(rankToon)) {
      return softBondLine(
        'ranking TOON ✅ · operate_close · no roadmap farm',
        registry,
        parentId,
        openGoal
      );
    }
    if (fs.existsSync(tokPilot)) {
      return softBondLine(
        'edges/ranking TOON pack · living_token_view kind=edges|actions|joys',
        registry,
        parentId,
        openGoal
      );
    }
    var tokResearch = path.join(rootDir, 'store', 'pages', 'research_token_compression.md');
    if (fs.existsSync(tokResearch) && !fs.existsSync(tokPilot)) {
      return softBondLine(
        'token road P30–P34 · living_token_view · operate close',
        registry,
        parentId,
        openGoal
      );
    }
  } catch (_t) { /* */ }
  try {
    var opPath = path.join(rootDir, 'store', 'pages', 'operate_close.md');
    if (fs.existsSync(opPath)) {
      return softBondLine(
        'operate_close · rankCycle · sheet SoT · no roadmap farm',
        registry,
        parentId,
        openGoal
      );
    }
  } catch (_o) { /* */ }
  try {
    var host = registry.host;
    var text = (host && host.docs && host.docs.RESEARCH) || '';
    if (!text) {
      var rp = path.join(rootDir, 'modalities', 'host', 'docs', 'RESEARCH.md');
      if (fs.existsSync(rp)) text = fs.readFileSync(rp, 'utf8');
    }
    var lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (/^\d+\.\s*\*\*Open:\*\*/i.test(line) || /^\*\*Open:\*\*/i.test(line)) {
        return softBondLine(
          line
            .replace(/^\d+\.\s*/, '')
            .replace(/\*\*/g, '')
            .replace(/^Open:\s*/i, '')
            .trim()
            .slice(0, 96),
          registry,
          parentId,
          openGoal
        );
      }
      if (/^\d+\.\s+\*\*Open:/i.test(line)) {
        return softBondLine(
          line.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').slice(0, 96),
          registry,
          parentId,
          openGoal
        );
      }
    }
  } catch (_e) { /* */ }
  return softBondLine(
    'operate · rankCycle / Grok-pick densest parent-goal help',
    registry,
    parentId,
    openGoal
  );
}

module.exports = {
  densestOpenNext: densestOpenNext
};
