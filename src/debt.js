/**
 * Densest-debt signals for nested pipeline: host → data → children.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var SAMPLE_SOFT = 120;
var CRAFT_SOFT = 6;

function sampleLines(rootDir) {
  var p = path.join(rootDir, 'store', 'pages', 'effectiveness_samples.jsonl');
  if (!fs.existsSync(p)) return 0;
  try {
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length;
  } catch (_e) {
    return 0;
  }
}

function craftPageCount(rootDir) {
  var d = path.join(rootDir, 'store', 'pages');
  if (!fs.existsSync(d)) return 0;
  try {
    return fs.readdirSync(d).filter(function (f) {
      return f.indexOf('page_') === 0;
    }).length;
  } catch (_e) {
    return 0;
  }
}

/**
 * @returns {{ has: boolean, reasons: string[], score: number }}
 * score ∈ [0,1] how urgently data layer should win host Best
 */
function dataDebt(rootDir) {
  var reasons = [];
  var score = 0;
  var nSamp = sampleLines(rootDir);
  if (nSamp > SAMPLE_SOFT) {
    reasons.push('samples_over_cap:' + nSamp);
    score += 0.35;
  }
  var expIdx = path.join(rootDir, 'store', 'exports', 'exports_index.md');
  if (!fs.existsSync(expIdx)) {
    reasons.push('missing_exports_index');
    score += 0.3;
  }
  var craftN = craftPageCount(rootDir);
  if (craftN > CRAFT_SOFT) {
    reasons.push('craft_pages_over_cap:' + craftN);
    score += 0.25;
  }
  var idx = path.join(rootDir, 'store', 'pages', 'data_index.md');
  if (!fs.existsSync(idx)) {
    reasons.push('missing_data_index');
    score += 0.25;
  } else {
    try {
      var t = fs.readFileSync(idx, 'utf8');
      // Explicit marks only — do NOT treat "debt: none" / field labels as debt
      // (data lambda once wrote `- debt: none` which false-triggered nested forever)
      var marked = false;
      if (/\bstale\b/i.test(t)) marked = true;
      var dm = t.match(/^\s*-\s*debt:\s*(.+)$/im);
      if (dm) {
        var val = String(dm[1] || '').trim().toLowerCase();
        if (val && val !== 'none' && val !== 'clear' && val !== 'ok' && val !== '—') {
          marked = true;
        }
      }
      if (marked) {
        reasons.push('data_index_marked_debt');
        score += 0.2;
      }
    } catch (_e) { /* */ }
  }
  if (score > 1) score = 1;
  return { has: reasons.length > 0, reasons: reasons, score: score };
}

/**
 * Calendar densest-debt: missing / stale / thin calendar_layers map.
 * Host rankCycle should prefer calendar_layers when has=true (via effectiveness).
 * score ∈ [0,1]
 */
function calendarDebt(rootDir) {
  var reasons = [];
  var score = 0;
  var p = path.join(rootDir, 'store', 'pages', 'calendar_layers.md');
  if (!fs.existsSync(p)) {
    reasons.push('missing_calendar_layers');
    score += 0.55;
  } else {
    try {
      var st = fs.statSync(p);
      var age = Date.now() - st.mtimeMs;
      if (age > 7 * 86400000) {
        reasons.push('calendar_stale_7d');
        score += 0.4;
      } else if (age > 86400000) {
        reasons.push('calendar_stale_1d');
        score += 0.25;
      }
      if (st.size < 400) {
        reasons.push('calendar_thin');
        score += 0.2;
      }
      // densest multi-scale map must mention Year→Hour path
      var t = fs.readFileSync(p, 'utf8');
      if (!/Year/i.test(t) || !/Hour/i.test(t)) {
        reasons.push('calendar_map_incomplete');
        score += 0.2;
      }
    } catch (_e) {
      reasons.push('calendar_unreadable');
      score += 0.3;
    }
  }
  if (score > 1) score = 1;
  return { has: reasons.length > 0, reasons: reasons, score: score };
}

/**
 * P60 floors+: research densest page missing / stale / thin (measured).
 * score ∈ [0,1]
 */
function researchDebt(rootDir) {
  var reasons = [];
  var score = 0;
  var p = path.join(rootDir, 'store', 'pages', 'research_latest.md');
  if (!fs.existsSync(p)) {
    reasons.push('missing_research_latest');
    score += 0.5;
  } else {
    try {
      var st = fs.statSync(p);
      var age = Date.now() - st.mtimeMs;
      if (age > 7 * 86400000) {
        reasons.push('research_stale_7d');
        score += 0.35;
      } else if (age > 3 * 86400000) {
        reasons.push('research_stale_3d');
        score += 0.2;
      }
      if (st.size < 200) {
        reasons.push('research_thin');
        score += 0.2;
      }
    } catch (_e) {
      reasons.push('research_unreadable');
      score += 0.3;
    }
  }
  if (score > 1) score = 1;
  return { has: reasons.length > 0, reasons: reasons, score: score };
}

/**
 * Merge data + calendar + research debt for host hop0 (densest reasons, capped score).
 */
function hostDebt(rootDir) {
  var d = dataDebt(rootDir);
  var c = calendarDebt(rootDir);
  var r = researchDebt(rootDir);
  var reasons = (d.reasons || [])
    .concat(c.reasons || [])
    .concat(r.reasons || []);
  var score = Math.min(
    1,
    (d.score || 0) +
      (c.has ? Math.min(0.45, c.score) : 0) +
      (r.has ? Math.min(0.3, r.score) : 0)
  );
  return {
    has: reasons.length > 0,
    reasons: reasons,
    score: score,
    data: d,
    calendar: c,
    research: r
  };
}

/**
 * P58: debt for any parent layer (not host-only).
 * Leaf/process parents get their own densest signal; unknown → empty.
 */
function debtForParent(rootDir, parentId) {
  parentId = parentId || 'host';
  if (parentId === 'host') return hostDebt(rootDir);
  if (parentId === 'data') return dataDebt(rootDir);
  if (parentId === 'calendar_layers') return calendarDebt(rootDir);
  if (parentId === 'research') return researchDebt(rootDir);
  return { has: false, reasons: [], score: 0 };
}

/**
 * P58/P60: post-blend j floors so open_next debt targets still win Best.
 * Table, not special-cases scattered in scoreChildren.
 * Priority when multiple: data > calendar > research
 * @returns {{ child: string, floor: number, reasons: string[] }[]}
 */
function debtFloors(rootDir, parentId) {
  parentId = parentId || 'host';
  var floors = [];
  if (parentId === 'host') {
    var d = dataDebt(rootDir);
    var c = calendarDebt(rootDir);
    var r = researchDebt(rootDir);
    if (d.has) {
      floors.push({
        child: 'data',
        floor: 0.88,
        reasons: d.reasons || []
      });
    }
    if (c.has) {
      // Below data when both — store hygiene first; calendar alone wins
      floors.push({
        child: 'calendar_layers',
        floor: d.has ? 0.75 : 0.9,
        reasons: c.reasons || []
      });
    }
    if (r.has) {
      // Below calendar/data — research densest only when higher debt clear
      var rFloor = d.has || c.has ? 0.62 : 0.78;
      floors.push({
        child: 'research',
        floor: rFloor,
        reasons: r.reasons || []
      });
    }
  }
  if (parentId === 'data') {
    // measured: craft pages over soft → pages child wins under data Best
    var craftN = craftPageCount(rootDir);
    if (craftN > CRAFT_SOFT) {
      floors.push({
        child: 'pages',
        floor: 0.85,
        reasons: ['craft_pages_over_cap:' + craftN]
      });
    }
  }
  return floors;
}

module.exports = {
  dataDebt: dataDebt,
  calendarDebt: calendarDebt,
  researchDebt: researchDebt,
  hostDebt: hostDebt,
  debtForParent: debtForParent,
  debtFloors: debtFloors,
  SAMPLE_SOFT: SAMPLE_SOFT,
  CRAFT_SOFT: CRAFT_SOFT
};
