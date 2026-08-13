/**
 * ranking_review — gate before joys/actions/expense-sync hit review_sot SoT.
 *
 * Law: review first, or real budget tracking leaks.
 * living-core authors proposals; review_sot owns baseline + approve.
 * Future: each calendar layer → modality after this gate is solid.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

function defaultRankingRoot() {
  if (process.env.REVIEW_SOT_ROOT) return path.resolve(process.env.REVIEW_SOT_ROOT);
  return path.resolve(__dirname, '..', '..', 'legacy', 'legacy', 'html');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) { /* */ }
  return fallback;
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function sha1(s) {
  return crypto.createHash('sha1').update(String(s || ''), 'utf8').digest('hex').slice(0, 12);
}

function reviewDir(root) {
  return path.join(root, 'joys', 'review');
}

function baselinePath(root) {
  return path.join(reviewDir(root), 'baseline.json');
}

function pendingPath(root) {
  return path.join(reviewDir(root), 'pending.json');
}

function historyPath(root) {
  return path.join(reviewDir(root), 'history.jsonl');
}

function appendHistory(root, row) {
  ensureDir(reviewDir(root));
  fs.appendFileSync(historyPath(root), JSON.stringify(row) + '\n', 'utf8');
}

/**
 * Snapshot review_sot SoT for review.
 * opts.workbook: optional live { expenses, income, summary } from UI/API
 * P45 D1: if omitted, densest-load vendor/workbook_data.json (sheet SoT · never invent $)
 */

/**
 * review_sot lineAmt densest port.
 * scenario: 'current' | 'projected' | 'auto' (current prefer, projected fallback).
 */
function densestLineAmt(it, scenario) {
  if (!it) return 0;
  var sc = scenario || 'auto';
  var c = Number(it.current);
  var p = Number(it.projected);
  if (sc === 'projected') {
    if (it.projected !== '' && it.projected != null && isFinite(p)) return p;
    return isFinite(c) ? c : 0;
  }
  if (sc === 'current') {
    if (it.current !== '' && it.current != null && isFinite(c)) return c;
    return isFinite(p) ? p : 0;
  }
  if (isFinite(c) && !(c === 0 && isFinite(p) && p !== 0 && (it.current === '' || it.current == null))) {
    if (it.current !== '' && it.current != null) return c;
  }
  if (isFinite(p) && (it.current === '' || it.current == null || (c === 0 && p !== 0))) return p;
  return isFinite(c) ? c : 0;
}

function densestIsDebtPay(it) {
  return it && it.payDebt != null && it.payDebt !== '' && !isNaN(Number(it.payDebt));
}

/**
 * Densest SUMMARY from workbook disk shape (port of review_sot calcSummary).
 * surplus = net − living − debtPayments. Never invent missing sheet fields.
 * scenario: 'current' | 'projected' | 'auto'
 */
function densestWorkbookSummary(wb, scenario) {
  if (!wb) return null;
  var sc = scenario || 'current';
  var gross = 0;
  var deductions = 0;
  ((wb.income && wb.income.entitlements) || []).forEach(function (i) {
    gross += densestLineAmt(i, sc);
  });
  ((wb.income && wb.income.deductions) || []).forEach(function (i) {
    deductions += densestLineAmt(i, sc);
  });
  var net = gross - deductions;

  var living = 0;
  var debtPays = 0;
  var linked = Object.create(null);
  ((wb.expenses && wb.expenses.sections) || []).forEach(function (sec) {
    (sec.items || []).forEach(function (it) {
      var a = densestLineAmt(it, sc);
      if (densestIsDebtPay(it)) {
        debtPays += a;
        var di = Number(it.payDebt);
        if (!linked[di]) linked[di] = 0;
        linked[di] += a;
      } else {
        living += a;
      }
    });
  });

  // cash debt payments: linked expense pays preferred, else scenario payment
  var debtPayments = 0;
  var debts = wb.debts || [];
  if (debts.length) {
    debts.forEach(function (d, i) {
      if (linked[i] != null) {
        debtPayments += linked[i];
        return;
      }
      var cash =
        sc === 'projected'
          ? Number(d.projected_payment)
          : Number(d.current_payment);
      if (!isFinite(cash) || cash <= 0) cash = Number(d.payment);
      if (!isFinite(cash) || cash <= 0) {
        cash =
          sc === 'projected'
            ? Number(d.current_payment)
            : Number(d.projected_payment);
      }
      if (!isFinite(cash) || cash <= 0) {
        var bal = Number(d.balance) || 0;
        var terms = Number(d.remainingTerms) || 0;
        if (terms > 0 && bal > 0) cash = bal / terms;
        else cash = 0;
      }
      debtPayments += cash;
    });
  } else {
    debtPayments = debtPays;
  }

  var surplus = net - living - debtPayments;
  var dti = gross > 0 ? debtPayments / gross : null;
  function r2(x) {
    return Math.round(Number(x) * 100) / 100;
  }
  return {
    scenario: sc,
    gross: r2(gross),
    net: r2(net),
    living: r2(living),
    debtPayments: r2(debtPayments),
    surplus: r2(surplus),
    dti: dti != null ? Math.round(dti * 10000) / 10000 : null,
    law: 'surplus = net − living − debtPayments · sheet SoT · never invent · scenario=' + sc
  };
}

/**
 * Load densest workbook SoT from review_sot disk (not localStorage).
 */
function loadWorkbookFromDisk(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var candidates = [];
  if (opts.path) candidates.push(opts.path);
  if (process.env.WORKBOOK_JSON) candidates.push(path.resolve(process.env.WORKBOOK_JSON));
  candidates.push(path.join(rankingRoot, 'vendor', 'workbook_data.json'));
  candidates.push(path.join(rankingRoot, 'workbook_data.json'));
  for (var i = 0; i < candidates.length; i++) {
    var p = candidates[i];
    if (!p || !fs.existsSync(p)) continue;
    try {
      var wb = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!wb || typeof wb !== 'object') continue;
      return {
        ok: true,
        path: p,
        source: 'disk',
        workbook: wb,
        summary: densestWorkbookSummary(wb)
      };
    } catch (_e) { /* try next */ }
  }
  return { ok: false, source: 'none', error: 'no_workbook_data', law: 'never invent $' };
}

function captureMoho(rankingRoot) {
  var mohoDir = path.join(rankingRoot, 'vendor', 'moho');
  var layersPath = path.join(mohoDir, 'layers.json');
  var bindingsPath = path.join(mohoDir, 'design_bindings.json');
  var layers = readJson(layersPath, null);
  var bindings = readJson(bindingsPath, null);
  var exportsDir = path.join(mohoDir, 'exports');
  var exportFiles = [];
  try {
    if (fs.existsSync(exportsDir)) {
      exportFiles = fs.readdirSync(exportsDir).filter(function (f) {
        return /\.(svg|png|webp|webm|gif)$/i.test(f);
      }).sort();
    }
  } catch (_e) { /* */ }
  var layersRaw = '';
  var bindingsRaw = '';
  try {
    if (fs.existsSync(layersPath)) layersRaw = fs.readFileSync(layersPath, 'utf8');
  } catch (_e2) { /* */ }
  try {
    if (fs.existsSync(bindingsPath)) bindingsRaw = fs.readFileSync(bindingsPath, 'utf8');
  } catch (_eB) { /* */ }
  var exportFinger = exportFiles.map(function (f) {
    try {
      var st = fs.statSync(path.join(exportsDir, f));
      return f + ':' + st.size;
    } catch (_e3) {
      return f;
    }
  }).join('|');
  var publishPath = path.join(mohoDir, 'published', 'moho_publish.json');
  var motionPath = path.join(mohoDir, 'published', 'motion_timeline.json');
  var publishRaw = '';
  var motionRaw = '';
  var publish = null;
  try {
    if (fs.existsSync(publishPath)) {
      publishRaw = fs.readFileSync(publishPath, 'utf8');
      publish = JSON.parse(publishRaw);
    }
  } catch (_p) { /* */ }
  try {
    if (fs.existsSync(motionPath)) motionRaw = fs.readFileSync(motionPath, 'utf8');
  } catch (_m) { /* */ }
  var seqDir = path.join(mohoDir, 'published', 'sequence');
  var seqN = 0;
  try {
    if (fs.existsSync(seqDir)) {
      seqN = fs.readdirSync(seqDir).filter(function (f) {
        return /\.(jpe?g|png)$/i.test(f);
      }).length;
    }
  } catch (_s) { /* */ }

  return {
    rev: layers && layers.rev,
    svg_first: !!(layers && layers.svg_first),
    design_bindings: !!(bindings && bindings.fail_closed),
    bindings_rev: bindings && bindings.rev,
    bindings_n: bindings && bindings.bindings ? bindings.bindings.length : 0,
    moho_published: !!(publish && publish.at),
    publish_at: publish && publish.at,
    publish_frames_n: seqN || (publish && publish.frames_n) || 0,
    layers_n: layers && layers.layers ? layers.layers.length : 0,
    events_n: layers && layers.events ? Object.keys(layers.events).length : 0,
    exports_n: exportFiles.length,
    exports: exportFiles,
    layers_hash: sha1(layersRaw),
    bindings_hash: sha1(bindingsRaw),
    publish_hash: sha1(publishRaw + '|' + motionRaw + '|seq:' + seqN),
    exports_hash: sha1(exportFinger),
    catalog_hash: sha1(
      layersRaw + '|' + bindingsRaw + '|' + exportFinger + '|' + publishRaw + '|' + motionRaw
    )
  };
}

function captureSnapshot(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var joysDir = path.join(rankingRoot, 'joys');
  var joys = [];
  if (fs.existsSync(joysDir)) {
    fs.readdirSync(joysDir, { withFileTypes: true }).forEach(function (ent) {
      if (!ent.isDirectory() || ent.name === 'review') return;
      var dir = path.join(joysDir, ent.name);
      var man = readJson(path.join(dir, 'MANIFEST.json'), null);
      var jmethod = '';
      try {
        jmethod = fs.readFileSync(path.join(dir, 'jmethod.js'), 'utf8');
      } catch (_e) { /* */ }
      var how = '';
      try {
        how = fs.readFileSync(path.join(dir, 'HOW.md'), 'utf8');
      } catch (_e2) { /* */ }
      joys.push({
        id: ent.name,
        title: man && man.title,
        polarity: man && man.polarity,
        status: man && man.status,
        relates_to: (man && man.relates_to) || [],
        jmethod_hash: sha1(jmethod),
        how_hash: sha1(how),
        author: man && man.author,
        at: man && man.at
      });
    });
  }
  joys.sort(function (a, b) {
    return a.id < b.id ? -1 : 1;
  });

  var actionsFile = path.join(joysDir, 'calendar_actions.json');
  var actionsCat = readJson(actionsFile, { actions: [] });
  var actions = (actionsCat.actions || []).map(function (a) {
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      polarity: a.polarity,
      amountMonthly: Number(a.amountMonthly) || 0,
      cadence: a.cadence,
      hours: a.hours,
      days: a.days,
      note: a.note || '',
      fingerprint: sha1(JSON.stringify({
        id: a.id,
        name: a.name,
        polarity: a.polarity,
        amountMonthly: a.amountMonthly,
        cadence: a.cadence,
        hours: a.hours,
        days: a.days
      }))
    };
  });
  actions.sort(function (a, b) {
    return String(a.id) < String(b.id) ? -1 : 1;
  });

  var relations = readJson(path.join(joysDir, 'relations.json'), { edges: [] });
  var edges_n = (relations.edges || []).length;

  // Expense catalog + money: opts.workbook OR densest disk workbook_data.json (P45)
  var expenses = [];
  var money = {
    net: null,
    living: null,
    debtCash: null,
    surplus: null,
    catalogSpend: null,
    gross: null,
    dti: null
  };
  var moneySource = null;
  var wb = opts.workbook || null;
  if (!wb && opts.load_workbook !== false) {
    var loaded = loadWorkbookFromDisk(rankingRoot, { path: opts.workbook_path });
    if (loaded.ok) {
      wb = loaded.workbook;
      moneySource = loaded.path;
    }
  } else if (wb) {
    moneySource = 'opts.workbook';
  }
  if (wb) {
    if (wb.expenses && wb.expenses.sections) {
      wb.expenses.sections.forEach(function (sec) {
        (sec.items || []).forEach(function (it) {
          var amt = densestLineAmt(it);
          if (!(amt > 0) || !it.name) return;
          expenses.push({
            name: it.name,
            amount: Math.round(amt * 100) / 100,
            section: sec.name || '',
            isDebtPay: densestIsDebtPay(it) || it.payToDebt != null || it.debtIndex != null
          });
        });
      });
    }
    // densest SUMMARY from sheet calc (prefer over incomplete wb.summary)
    // CURRENT is gate money SoT; PROJECTED is Budget potential + review budget accepts
    var sum = densestWorkbookSummary(wb, 'current');
    var sumP = densestWorkbookSummary(wb, 'projected');
    if (sum) {
      money.net = sum.net;
      money.living = sum.living;
      money.debtCash = sum.debtPayments;
      money.surplus = sum.surplus;
      money.gross = sum.gross;
      money.dti = sum.dti;
      money.scenario = 'current';
    }
    if (sumP) {
      money.projected = {
        net: sumP.net,
        living: sumP.living,
        debtCash: sumP.debtPayments,
        surplus: sumP.surplus,
        gross: sumP.gross,
        dti: sumP.dti,
        scenario: 'projected'
      };
    }
    if (wb.summary) {
      if (money.net == null && wb.summary.net != null) money.net = wb.summary.net;
      if (money.living == null && wb.summary.living != null) money.living = wb.summary.living;
      if (money.debtCash == null && wb.summary.debtPayments != null) {
        money.debtCash = wb.summary.debtPayments;
      }
      if (money.surplus == null && wb.summary.surplus != null) money.surplus = wb.summary.surplus;
    }
    if (wb.income && wb.income.net != null && money.net == null) money.net = wb.income.net;
  }
  money.catalogSpend = expenses.reduce(function (s, e) {
    return s + e.amount;
  }, 0);
  money.catalogSpend = Math.round(Number(money.catalogSpend) * 100) / 100;

  var customSpend = 0;
  var customGain = 0;
  actions.forEach(function (a) {
    if (a.kind === 'work') return;
    if (!(a.amountMonthly > 0)) return;
    // if also an expense name, not leakage
    var onSheet = expenses.some(function (e) {
      return e.name === a.name;
    });
    if (onSheet) return;
    if (a.polarity === 'gain') customGain += a.amountMonthly;
    else customSpend += a.amountMonthly;
  });

  return {
    at: new Date().toISOString(),
    ranking_root: rankingRoot,
    joys: joys,
    actions: actions,
    expenses: expenses,
    money: money,
    money_source: moneySource,
    expenses_n: expenses.length,
    edges_n: edges_n,
    leakage: {
      customSpendOffSheet: customSpend,
      customGainOffSheet: customGain,
      catalogVsLivingDebt:
        money.living != null && money.debtCash != null
          ? Math.round((money.catalogSpend - (money.living + money.debtCash)) * 100) / 100
          : null
    },
    moho: captureMoho(rankingRoot),
    law: 'review gate — approve before SoT drifts; expense layers stay in sync · sheet $ never invent'
  };
}

function diffLists(baseArr, liveArr, keyFn, fields) {
  baseArr = baseArr || [];
  liveArr = liveArr || [];
  var baseMap = Object.create(null);
  var liveMap = Object.create(null);
  baseArr.forEach(function (x) {
    baseMap[keyFn(x)] = x;
  });
  liveArr.forEach(function (x) {
    liveMap[keyFn(x)] = x;
  });
  var added = [];
  var removed = [];
  var changed = [];
  Object.keys(liveMap).forEach(function (k) {
    if (!baseMap[k]) added.push(liveMap[k]);
    else {
      var diffs = [];
      (fields || []).forEach(function (f) {
        var a = JSON.stringify(baseMap[k][f]);
        var b = JSON.stringify(liveMap[k][f]);
        if (a !== b) diffs.push({ field: f, from: baseMap[k][f], to: liveMap[k][f] });
      });
      if (diffs.length) changed.push({ id: k, before: baseMap[k], after: liveMap[k], diffs: diffs });
    }
  });
  Object.keys(baseMap).forEach(function (k) {
    if (!liveMap[k]) removed.push(baseMap[k]);
  });
  return { added: added, removed: removed, changed: changed };
}

function buildReview(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var live = captureSnapshot(rankingRoot, opts);
  var baseline = readJson(baselinePath(rankingRoot), null);
  var pending = readJson(pendingPath(rankingRoot), { proposals: [] });

  var joyDiff = baseline
    ? diffLists(baseline.joys, live.joys, function (j) {
        return j.id;
      }, ['title', 'polarity', 'status', 'relates_to', 'jmethod_hash', 'how_hash'])
    : { added: live.joys, removed: [], changed: [], note: 'no_baseline' };

  var actionDiff = baseline
    ? diffLists(baseline.actions, live.actions, function (a) {
        return a.id;
      }, ['name', 'polarity', 'amountMonthly', 'cadence', 'fingerprint', 'kind'])
    : { added: live.actions, removed: [], changed: [], note: 'no_baseline' };

  var expenseDiff = baseline
    ? diffLists(baseline.expenses, live.expenses, function (e) {
        return e.name;
      }, ['amount', 'section', 'isDebtPay'])
    : { added: live.expenses, removed: [], changed: [], note: 'no_baseline' };

  var moneyDiff = null;
  if (baseline && baseline.money) {
    moneyDiff = {};
    ['net', 'living', 'debtCash', 'surplus', 'catalogSpend'].forEach(function (k) {
      var a = baseline.money[k];
      var b = live.money[k];
      if (a !== b && !(a == null && b == null)) {
        moneyDiff[k] = { from: a, to: b, delta: b != null && a != null ? b - a : null };
      }
    });
    if (!Object.keys(moneyDiff).length) moneyDiff = null;
  }

  var findings = [];
  if (!baseline) {
    findings.push({
      severity: 'warn',
      code: 'no_baseline',
      message: 'No approved baseline yet — capture baseline after first review to lock tracking'
    });
  }
  if (live.leakage && live.leakage.customSpendOffSheet > 0) {
    findings.push({
      severity: 'leak',
      code: 'custom_spend_off_sheet',
      message:
        'Custom calendar actions spend $' +
        live.leakage.customSpendOffSheet.toFixed(2) +
        '/mo not on EXPENSES — budget leakage risk until reviewed/synced',
      amount: live.leakage.customSpendOffSheet
    });
  }
  if (live.leakage && live.leakage.catalogVsLivingDebt != null && Math.abs(live.leakage.catalogVsLivingDebt) > 1) {
    findings.push({
      severity: 'warn',
      code: 'catalog_vs_living_debt',
      message:
        'Sum of expense lines differs from living+debt by $' +
        Number(live.leakage.catalogVsLivingDebt).toFixed(2) +
        ' — keep layers in sync via review',
      amount: live.leakage.catalogVsLivingDebt
    });
  }
  if (joyDiff.added.length || joyDiff.removed.length || joyDiff.changed.length) {
    findings.push({
      severity: 'info',
      code: 'joy_delta',
      message:
        'Joys: +' +
        joyDiff.added.length +
        ' −' +
        joyDiff.removed.length +
        ' ~' +
        joyDiff.changed.length
    });
  }
  if (actionDiff.added.length || actionDiff.removed.length || actionDiff.changed.length) {
    findings.push({
      severity: 'info',
      code: 'action_delta',
      message:
        'Actions: +' +
        actionDiff.added.length +
        ' −' +
        actionDiff.removed.length +
        ' ~' +
        actionDiff.changed.length
    });
  }
  if (expenseDiff.added.length || expenseDiff.removed.length || expenseDiff.changed.length) {
    findings.push({
      severity: 'info',
      code: 'expense_delta',
      message:
        'Expenses: +' +
        expenseDiff.added.length +
        ' −' +
        expenseDiff.removed.length +
        ' ~' +
        expenseDiff.changed.length
    });
  }

  var mohoDiff = null;
  if (baseline && baseline.moho && live.moho) {
    if (baseline.moho.catalog_hash !== live.moho.catalog_hash) {
      mohoDiff = { from: baseline.moho, to: live.moho, changed: true };
      findings.push({
        severity: 'info',
        code: 'motion_delta',
        message: 'Moho/SVG motion catalog changed (rev ' + (baseline.moho.rev || '?') + ' → ' + (live.moho.rev || '?') + ', exports ' + (baseline.moho.exports_n || 0) + ' → ' + (live.moho.exports_n || 0) + ')'
      });
    }
  }

  var pendingN = (pending.proposals || []).length;
  if (pendingN) {
    findings.push({
      severity: 'pending',
      code: 'pending_proposals',
      message: pendingN + ' proposal(s) waiting for approve/reject',
      n: pendingN
    });
  }

  // P45: densest sheet money always surfaced when workbook SoT loads
  if (live.money && live.money.net != null) {
    var mp = live.money.projected;
    findings.push({
      severity: 'info',
      code: 'money_sheet',
      message:
        'CURRENT net=' +
        live.money.net +
        ' living=' +
        live.money.living +
        ' debt=' +
        live.money.debtCash +
        ' surplus=' +
        live.money.surplus +
        (mp
          ? ' · PROJECTED surplus=' +
            mp.surplus +
            ' net=' +
            mp.net
          : '') +
        (live.money_source ? ' · ' + path.basename(String(live.money_source)) : ''),
      money: live.money,
      source: live.money_source
    });
  } else if (opts.load_workbook !== false) {
    findings.push({
      severity: 'warn',
      code: 'money_missing',
      message: 'no workbook_data.json — REVIEW money null (never invent $)'
    });
  }

  var dirty =
    !baseline ||
    joyDiff.added.length +
      joyDiff.removed.length +
      joyDiff.changed.length +
      actionDiff.added.length +
      actionDiff.removed.length +
      actionDiff.changed.length +
      expenseDiff.added.length +
      expenseDiff.removed.length +
      expenseDiff.changed.length >
      0 ||
    !!moneyDiff ||
    pendingN > 0 ||
    !!mohoDiff ||
    (live.leakage && live.leakage.customSpendOffSheet > 0);

  var gate = {
    open: true, // always can review
    apply_blocked: dirty && !!baseline, // block silent apply when dirty vs baseline
    must_review: dirty,
    note: dirty
      ? 'Changes or leakage present — review before trusting calendar/year money'
      : 'Clean vs baseline'
  };

  return {
    ok: true,
    at: new Date().toISOString(),
    ranking_root: rankingRoot,
    has_baseline: !!baseline,
    baseline_at: baseline && baseline.at,
    dirty: dirty,
    gate: gate,
    findings: findings,
    joy_diff: joyDiff,
    action_diff: actionDiff,
    expense_diff: expenseDiff,
    money_diff: moneyDiff,
    money_source: live.money_source || null,
    moho_diff: mohoDiff,
    live: live,
    baseline: baseline
      ? {
          at: baseline.at,
          joys_n: (baseline.joys || []).length,
          actions_n: (baseline.actions || []).length,
          expenses_n: (baseline.expenses || []).length,
          money: baseline.money,
          moho: baseline.moho || null
        }
      : null,
    pending: pending,
    lore: opts.lore || null,
    law: 'review first — then expense sync — later calendar layers as modalities'
  };
}

function approveBaseline(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var snap = captureSnapshot(rankingRoot, opts);
  snap.approved_at = new Date().toISOString();
  snap.approved_by = opts.author || 'living-core+review_sot';
  snap.note = opts.note || 'approved review baseline';
  writeJson(baselinePath(rankingRoot), snap);
  // clear pending if requested
  if (opts.clear_pending !== false) {
    writeJson(pendingPath(rankingRoot), {
      proposals: [],
      cleared_at: snap.approved_at
    });
  }
  appendHistory(rankingRoot, {
    op: 'approve_baseline',
    at: snap.approved_at,
    joys_n: snap.joys.length,
    actions_n: snap.actions.length,
    expenses_n: snap.expenses.length,
    money: snap.money,
    leakage: snap.leakage
  });
  return {
    ok: true,
    baseline_at: snap.approved_at,
    path: baselinePath(rankingRoot),
    snapshot: {
      joys_n: snap.joys.length,
      actions_n: snap.actions.length,
      expenses_n: snap.expenses.length,
      money: snap.money,
      leakage: snap.leakage
    },
    note: 'Baseline locked — further joy/action/expense drift will show in review'
  };
}

/**
 * Queue a proposal instead of writing SoT directly (gate).
 * kind: joy | action | expense_sync | note | growth
 */
function propose(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var pending = readJson(pendingPath(rankingRoot), { proposals: [] });
  if (!Array.isArray(pending.proposals)) pending.proposals = [];
  var id = opts.id || 'prop_' + Date.now().toString(36) + '_' + sha1(JSON.stringify(opts)).slice(0, 6);
  // dedupe by stable id — replace existing pending with same id
  pending.proposals = pending.proposals.filter(function (p) {
    return !p || p.id !== id;
  });
  var prop = {
    id: id,
    kind: opts.kind || 'note',
    title: opts.title || opts.name || id,
    body: opts.body || opts.note || '',
    payload: opts.payload || opts,
    author: opts.author || 'living-core',
    at: new Date().toISOString(),
    status: 'pending'
  };
  pending.proposals.push(prop);
  pending.updated_at = prop.at;
  writeJson(pendingPath(rankingRoot), pending);
  appendHistory(rankingRoot, { op: 'propose', id: id, kind: prop.kind, at: prop.at });
  return { ok: true, proposal: prop, pending_n: pending.proposals.length, path: pendingPath(rankingRoot) };
}

/**
 * Discover growth / cut / payoff / schedule actions from sheet SoT.
 * Never invents $ — only surfaces sheet lines, surplus headroom, and structural notes.
 * Queues REVIEW proposals (pending.json). opts.dry_run=true → candidates only.
 */
function discoverGrowth(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var live = captureSnapshot(rankingRoot, opts);
  var money = live.money || {};
  var surplus = Number(money.surplus);
  if (!isFinite(surplus)) surplus = 0;
  var surplusR = Math.round(surplus * 100) / 100;

  var loaded = loadWorkbookFromDisk(rankingRoot, opts);
  var wb = (loaded && loaded.ok && loaded.workbook) || null;
  var existingActs = Object.create(null);
  (live.actions || []).forEach(function (a) {
    if (a && a.id) existingActs[a.id] = true;
  });
  var pending = readJson(pendingPath(rankingRoot), { proposals: [] });
  var pendingIds = Object.create(null);
  (pending.proposals || []).forEach(function (p) {
    if (p && p.id) pendingIds[p.id] = true;
  });

  var candidates = [];
  function addCand(c) {
    candidates.push(c);
  }

  // --- 1) Cuttable leisure / non-debt living lines (sheet names + amounts only) ---
  var cuttable = (live.expenses || []).filter(function (e) {
    if (!e || e.isDebtPay) return false;
    var a = Number(e.amount) || 0;
    if (a <= 0) return false;
    var sec = String(e.section || '').toUpperCase();
    var name = String(e.name || '');
    // prefer leisure/hobbies; also flag small personal/discretionary
    var leisure =
      /LEISURE|HOBB|ENTERTAIN|SUBSCRIP/i.test(sec) ||
      /spotify|playstation|minecraft|icloud|proton|digital ocean|cloudflare|apple dev|netflix|hulu|disney|game/i.test(
        name
      );
    // exclude insurance / car / gas (transport core) from "easy cut" unless tiny
    if (/insurance|gas\b|^car$/i.test(name) && a >= 50) return false;
    return leisure;
  });
  cuttable.sort(function (a, b) {
    return (Number(b.amount) || 0) - (Number(a.amount) || 0);
  });
  cuttable.slice(0, 8).forEach(function (e) {
    var amt = Math.round((Number(e.amount) || 0) * 100) / 100;
    addCand({
      id: 'disc_cut_' + sha1(e.name).slice(0, 8),
      kind: 'note',
      title: 'Cut / pause · ' + e.name + ' ($' + amt + '/mo sheet)',
      body:
        'Sheet EXPENSE cuttable · section=' +
        (e.section || '?') +
        ' · amount=$' +
        amt +
        ' (SoT). Zero or reduce on review_sot sheet to free surplus · never invent $ here. Relates joy_money + joy_surplus_freedom.',
      payload: {
        discovery: 'cut_expense',
        expenseName: e.name,
        amountMonthly: amt,
        section: e.section,
        relates_to: ['joy_money', 'joy_surplus_freedom'],
        sheet_only: true,
        scenario: 'review',
        law: 'accept → PROJ+REVIEW $0 live · promote Review→Proj then Proj→Current · CURRENT untouched until promote'
      }
    });
  });

  // --- 2) Debt payoff headroom (surplus → highest APR balance on sheet DEBTS) ---
  var debts = (wb && wb.debts) || [];
  if (debts.length && surplusR > 0) {
    var ranked = debts
      .map(function (d, i) {
        return {
          i: i,
          creditor: d.creditor || d.name || 'debt_' + i,
          purpose: d.purpose || '',
          balance: Number(d.balance) || 0,
          apr: Number(d.aprPct != null ? d.aprPct : d.apr) || 0,
          pay: Number(d.current_payment) || 0
        };
      })
      .filter(function (d) {
        return d.balance > 0;
      })
      .sort(function (a, b) {
        return b.apr - a.apr || b.balance - a.balance;
      });
    ranked.slice(0, 2).forEach(function (d) {
      var headroom = Math.min(surplusR, d.balance);
      headroom = Math.round(headroom * 100) / 100;
      var actId = 'act_debt_extra_' + sha1(d.creditor + d.purpose).slice(0, 8);
      addCand({
        id: 'disc_payoff_' + sha1(d.creditor).slice(0, 8),
        kind: 'action',
        title: 'Extra debt pay · ' + (d.purpose || d.creditor) + ' (≤$' + headroom + ' headroom)',
        body:
          'Surplus headroom $' +
          surplusR +
          ' (sheet net−living−debt) · target ' +
          d.creditor +
          ' / ' +
          d.purpose +
          ' bal=$' +
          d.balance +
          ' APR=' +
          d.apr +
          '% · current_payment=$' +
          d.pay +
          '. Cap extra ≤ min(surplus, balance)=$' +
          headroom +
          '. $0 on calendar until sheet DEBT/EXPENSE line updated — never invent payment amount. Relates joy_debt_urgency + joy_surplus_freedom.',
        payload: {
          discovery: 'debt_payoff',
          action: {
            id: actId,
            name: 'Extra pay · ' + (d.purpose || d.creditor),
            kind: 'debt',
            polarity: 'spend',
            amountMonthly: 0,
            cadence: 'monthly',
            hours: [9],
            days: [1],
            note:
              'sheet headroom ≤$' +
              headroom +
              ' · ' +
              d.creditor +
              ' APR ' +
              d.apr +
              '% · pay on sheet not invent',
            author: 'living-core-discover'
          },
          debtIndex: d.i,
          creditor: d.creditor,
          purpose: d.purpose,
          balance: d.balance,
          aprPct: d.apr,
          headroom: headroom,
          surplus: surplusR,
          relates_to: ['joy_debt_urgency', 'joy_surplus_freedom', 'joy_calendar']
        }
      });
    });
  } else if (surplusR <= 0) {
    addCand({
      id: 'disc_payoff_no_headroom',
      kind: 'note',
      title: 'No surplus headroom for extra debt pay',
      body:
        'surplus=$' +
        surplusR +
        ' · cut living/leisure or raise net on sheet before extra payoff. Relates joy_debt_urgency.',
      payload: { discovery: 'debt_payoff', surplus: surplusR, headroom: 0 }
    });
  }

  // --- 3) Move-out / BAH structural (sheet income lines only — never invent BAH $) ---
  var entitlements = (wb && wb.income && wb.income.entitlements) || [];
  var deductions = (wb && wb.income && wb.income.deductions) || [];
  function findLine(arr, re) {
    for (var i = 0; i < arr.length; i++) {
      if (re.test(String(arr[i].name || ''))) return arr[i];
    }
    return null;
  }
  var bah = findLine(entitlements, /BAH/i);
  var bas = findLine(entitlements, /\bBAS\b/i);
  var mealDed = findLine(deductions, /Meal Deduction/i);
  var bahAmt = bah ? densestLineAmt(bah) : null;
  var basAmt = bas ? densestLineAmt(bas) : null;
  var mealAmt = mealDed ? densestLineAmt(mealDed) : null;
  var barracksLike = bahAmt != null && bahAmt < 50 && mealAmt != null && mealAmt > 0;
  if (barracksLike || (bahAmt != null && bahAmt < 50)) {
    addCand({
      id: 'disc_bah_moveout',
      kind: 'note',
      title: 'Growth · move-out → real BAH (sheet research)',
      body:
        'Sheet INCOME: BAH=$' +
        (bahAmt != null ? bahAmt : '?') +
        ' · BAS=$' +
        (basAmt != null ? basAmt : '?') +
        ' · Meal Deduction=$' +
        (mealAmt != null ? mealAmt : '?') +
        '. Barracks/on-base pattern: move-out can replace tiny BAH with locality BAH and drop meal deduction when off dining facility. ' +
        'Do NOT invent BAH $ — look up BAH rate for new ZIP, enter on sheet INCOME.BAH, adjust Meal Deduction / housing expenses on sheet, re-run REVIEW. Relates joy_money + joy_surplus_freedom.',
      payload: {
        discovery: 'bah_moveout',
        sheet: {
          bah: bahAmt,
          bas: basAmt,
          mealDeduction: mealAmt
        },
        law: 'never invent BAH amount — sheet SoT only after user fills locality rate',
        relates_to: ['joy_money', 'joy_surplus_freedom', 'joy_age_happiness']
      }
    });
  }

  // --- 4) Happiness / growth schedule actions ($0 — free or pay from surplus later on sheet) ---
  var growthActs = [
    {
      id: 'act_out_walk',
      name: 'Walk / outdoor time',
      hours: [17],
      days: [0, 6],
      cadence: 'weekly',
      note: 'free H raise · schedule only · joy_age_happiness'
    },
    {
      id: 'act_social_out',
      name: 'Social outing',
      hours: [19],
      days: [5],
      cadence: 'weekly',
      note: 'H raise · $0 until sheet EXPENSE if paid · surplus only'
    },
    {
      id: 'act_debt_review',
      name: 'Debt / budget review',
      hours: [10],
      days: [0],
      cadence: 'weekly',
      note: 'monthly plan check · sheet DEBTS + surplus · joy_debt_urgency'
    }
  ];
  growthActs.forEach(function (ga) {
    if (existingActs[ga.id]) return;
    addCand({
      id: 'disc_' + ga.id,
      kind: 'action',
      title: 'Schedule · ' + ga.name,
      body:
        ga.note +
        ' · amountMonthly=$0 (never invent spend). Accept in REVIEW to write calendar_actions.',
      payload: {
        discovery: 'happiness_schedule',
        action: {
          id: ga.id,
          name: ga.name,
          kind: 'joy',
          polarity: 'neutral',
          amountMonthly: 0,
          cadence: ga.cadence,
          hours: ga.hours,
          days: ga.days,
          note: ga.note,
          author: 'living-core-discover'
        },
        relates_to: ['joy_age_happiness', 'joy_calendar', 'joy_surplus_freedom']
      }
    });
  });

  // --- 5) Multi-model joy lenses (money→happy is one of many) ---
  try {
    var joyModels = require('./joy_models');
    joyModels.writeCatalog(path.resolve(__dirname, '..'), rankingRoot, { money: money });
    var mc = joyModels.discoverModelCandidates(rankingRoot, opts);
    (mc.candidates || []).forEach(function (c) {
      addCand(c);
    });
  } catch (_jm) { /* joy_models optional */ }

  // --- 6) Money roll-up note (always one densest headroom card) ---
  addCand({
    id: 'disc_money_headroom',
    kind: 'note',
    title:
      'Headroom · surplus $' +
      surplusR +
      ' · cuttable $' +
      Math.round(
        cuttable.reduce(function (s, e) {
          return s + (Number(e.amount) || 0);
        }, 0) * 100
      ) /
        100 +
      '/mo leisure',
    body:
      'Sheet densest: net=$' +
      (money.net != null ? money.net : '?') +
      ' living=$' +
      (money.living != null ? money.living : '?') +
      ' debtCash=$' +
      (money.debtCash != null ? money.debtCash : '?') +
      ' surplus=$' +
      surplusR +
      ' dti=' +
      (money.dti != null ? money.dti : '?') +
      '. Wiggle room = surplus + optional cuttable leisure (listed). Debt extra ≤ surplus. BAH growth = structural sheet edit. Multi-model: joy_models modality. Law: never invent $.',
    payload: {
      discovery: 'headroom',
      money: money,
      cuttable_n: cuttable.length,
      debts_n: debts.length,
      barracks_like: !!barracksLike
    }
  });

  var dry = opts.dry_run === true || opts.apply === false;
  if (opts.apply === true) dry = false;
  // default: queue proposals
  if (opts.dry_run == null && opts.apply == null) dry = false;

  var queued = [];
  var skipped = [];
  if (!dry) {
    candidates.forEach(function (c) {
      if (opts.refresh !== true && pendingIds[c.id]) {
        skipped.push({ id: c.id, reason: 'already_pending' });
        return;
      }
      var r = propose(rankingRoot, {
        id: c.id,
        kind: c.kind,
        title: c.title,
        body: c.body,
        payload: c.payload,
        author: opts.author || 'living-core-discover'
      });
      if (r && r.ok) queued.push(c.id);
    });
  }

  appendHistory(rankingRoot, {
    op: 'discover',
    at: new Date().toISOString(),
    candidates_n: candidates.length,
    queued_n: queued.length,
    dry: !!dry,
    surplus: surplusR
  });

  return {
    ok: true,
    dry_run: !!dry,
    money: money,
    candidates_n: candidates.length,
    queued_n: queued.length,
    skipped_n: skipped.length,
    queued: queued,
    skipped: skipped,
    candidates: candidates.map(function (c) {
      return {
        id: c.id,
        kind: c.kind,
        title: c.title,
        discovery: c.payload && c.payload.discovery
      };
    }),
    law: 'sheet SoT · surplus headroom · never invent $ · REVIEW accept materializes actions',
    note: dry
      ? 'dry_run — set apply=true (default) to queue pending proposals'
      : 'queued ' + queued.length + ' proposal(s) → review_sot REVIEW · Save accepted'
  };
}

function rejectProposal(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var pending = readJson(pendingPath(rankingRoot), { proposals: [] });
  var id = opts.id || opts.proposal_id;
  var before = (pending.proposals || []).length;
  if (id === '*' || opts.all) {
    pending.proposals = [];
  } else {
    pending.proposals = (pending.proposals || []).filter(function (p) {
      return p.id !== id;
    });
  }
  pending.updated_at = new Date().toISOString();
  writeJson(pendingPath(rankingRoot), pending);
  appendHistory(rankingRoot, {
    op: 'reject',
    id: id || 'all',
    at: pending.updated_at,
    removed: before - pending.proposals.length
  });
  return { ok: true, pending_n: pending.proposals.length };
}

/**
 * Apply expense sync plan: mark which expense names are SoT for calendar.
 * Does not rewrite EXPENSES — writes joys/review/expense_sync.json contract.
 */
function applyExpenseSync(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var live = captureSnapshot(rankingRoot, opts);
  var contract = {
    at: new Date().toISOString(),
    law: 'expense-based calendar items must match EXPENSES ($ > 0); customs off-sheet need review',
    expenses: live.expenses,
    money: live.money,
    leakage: live.leakage,
    author: opts.author || 'living-core'
  };
  var p = path.join(reviewDir(rankingRoot), 'expense_sync.json');
  writeJson(p, contract);
  appendHistory(rankingRoot, {
    op: 'expense_sync',
    at: contract.at,
    expenses_n: contract.expenses.length,
    catalogSpend: live.money.catalogSpend,
    surplus: live.money.surplus
  });
  return { ok: true, path: p, contract: contract, note: 'Expense sync contract written — calendar should use sheet SoT' };
}


/**
 * Flatten review report into per-row items for accept/reject UI.
 * Each item: { key, domain, op, id, title, detail, payload }
 */
function listReviewItems(report) {
  report = report || {};
  var items = [];
  function add(domain, op, id, title, detail, payload) {
    items.push({
      key: domain + ':' + op + ':' + id,
      domain: domain,
      op: op,
      id: id,
      title: title || id,
      detail: detail || '',
      payload: payload || null
    });
  }
  function walkDiff(domain, diff, labelFn) {
    diff = diff || {};
    (diff.added || []).forEach(function (x) {
      var id = x.id || x.name;
      add(domain, 'added', id, labelFn(x), 'new vs baseline', x);
    });
    (diff.removed || []).forEach(function (x) {
      var id = x.id || x.name;
      add(domain, 'removed', id, labelFn(x), 'missing from live', x);
    });
    (diff.changed || []).forEach(function (x) {
      var id = x.id || (x.after && (x.after.id || x.after.name)) || 'changed';
      var det = (x.diffs || []).map(function (d) {
        return d.field + ': ' + JSON.stringify(d.from) + ' → ' + JSON.stringify(d.to);
      }).join('; ');
      add(domain, 'changed', id, labelFn(x.after || x.before || { id: id }), det, x);
    });
  }
  walkDiff('joy', report.joy_diff, function (x) {
    return (x && (x.title || x.id)) || 'joy';
  });
  walkDiff('action', report.action_diff, function (x) {
    return (x && (x.name || x.id)) || 'action';
  });
  walkDiff('expense', report.expense_diff, function (x) {
    return (x && x.name) || 'expense';
  });
  (report.findings || []).forEach(function (f, i) {
    if (f.code === 'joy_delta' || f.code === 'action_delta' || f.code === 'expense_delta' || f.code === 'pending_proposals') return;
    add('finding', f.severity || 'info', f.code || ('f' + i), f.code || 'finding', f.message || '', f);
  });
  var pend = (report.pending && report.pending.proposals) || [];
  pend.forEach(function (p) {
    add('proposal', 'pending', p.id, p.title || p.id, (p.kind || '') + ' · ' + (p.body || p.note || ''), p);
  });
  return items;
}

/**
 * Apply per-item decisions to produce new baseline + side effects.
 * decisions: { [key]: 'accept' | 'reject' }
 * opts.live, opts.baseline from report
 */
function applyDecisions(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var decisions = opts.decisions || {};
  var report = opts.report || buildReview(rankingRoot, opts);
  var items = listReviewItems(report);
  var live = report.live || captureSnapshot(rankingRoot, opts);
  var baseline = readJson(baselinePath(rankingRoot), null) || {
    joys: [],
    actions: [],
    expenses: [],
    money: {},
    leakage: {}
  };

  // maps
  function byId(arr, key) {
    var m = Object.create(null);
    (arr || []).forEach(function (x) {
      m[x.id || x.name] = x;
    });
    return m;
  }
  var joyBase = byId(baseline.joys, 'id');
  var joyLive = byId(live.joys, 'id');
  var actBase = byId(baseline.actions, 'id');
  var actLive = byId(live.actions, 'id');
  var expBase = byId(baseline.expenses, 'name');
  var expLive = byId(live.expenses, 'name');

  // default undecided = reject for safety (no silent accept)
  var applied = [];
  var rejected = [];
  items.forEach(function (it) {
    var d = decisions[it.key];
    if (d !== 'accept' && d !== 'reject') d = 'reject';
    if (d === 'accept') applied.push(it);
    else rejected.push(it);

    if (it.domain === 'joy') {
      if (it.op === 'added') {
        if (d === 'accept' && joyLive[it.id]) joyBase[it.id] = joyLive[it.id];
        // reject added: leave out of baseline
      } else if (it.op === 'removed') {
        if (d === 'accept') delete joyBase[it.id]; // accept removal
        // reject removal: keep joyBase[it.id]
      } else if (it.op === 'changed') {
        if (d === 'accept' && joyLive[it.id]) joyBase[it.id] = joyLive[it.id];
        // reject: keep baseline
      }
    }
    if (it.domain === 'action') {
      if (it.op === 'added') {
        if (d === 'accept' && actLive[it.id]) actBase[it.id] = actLive[it.id];
      } else if (it.op === 'removed') {
        if (d === 'accept') delete actBase[it.id];
      } else if (it.op === 'changed') {
        if (d === 'accept' && actLive[it.id]) actBase[it.id] = actLive[it.id];
      }
    }
    if (it.domain === 'expense') {
      if (it.op === 'added') {
        if (d === 'accept' && expLive[it.id]) expBase[it.id] = expLive[it.id];
      } else if (it.op === 'removed') {
        if (d === 'accept') delete expBase[it.id];
      } else if (it.op === 'changed') {
        if (d === 'accept' && expLive[it.id]) expBase[it.id] = expLive[it.id];
      }
    }
    if (it.domain === 'proposal' && d === 'accept') {
      // listReviewItems passes full proposal as payload → prop.payload.action
      var prop = it.payload || {};
      var inner = prop.payload || prop;
      var act = (inner && inner.action) || (prop.action) || null;
      if (act && act.id) {
        actBase[act.id] = {
          id: act.id,
          name: act.name || act.id,
          kind: act.kind || 'custom',
          polarity: act.polarity || 'neutral',
          amountMonthly: Number(act.amountMonthly) || 0,
          cadence: act.cadence || 'weekly',
          hours: act.hours || [12],
          days: act.days,
          note: act.note || '',
          fingerprint: sha1(JSON.stringify(act))
        };
        actLive[act.id] = actBase[act.id];
      }
    }
    if (it.domain === 'finding' && it.id === 'custom_spend_off_sheet' && d === 'accept') {
      // accepting leakage finding means acknowledge — zero off-sheet spend in actions SoT
      Object.keys(actLive).forEach(function (id) {
        var a = actLive[id];
        if (!a || a.kind === 'work') return;
        if (Number(a.amountMonthly) > 0) {
          // if not on expense sheet names, zero in actBase
          var onSheet = expLive[a.name] || Object.keys(expLive).some(function (n) {
            return n === a.name;
          });
          if (!onSheet) {
            actBase[id] = Object.assign({}, a, {
              amountMonthly: 0,
              note: (a.note || '') + ' [zeroed on review accept leakage]'
            });
          }
        }
      });
    }
  });

  // Build new baseline from maps; for domains with no items, prefer live if first baseline
  var newJoys = Object.keys(joyBase).map(function (k) { return joyBase[k]; });
  var newActions = Object.keys(actBase).map(function (k) { return actBase[k]; });
  var newExpenses = Object.keys(expBase).map(function (k) { return expBase[k]; });

  // If no baseline existed, accept path: only accepted adds populate; also include unchanged live for clean first save
  if (!report.has_baseline && Object.keys(decisions).length) {
    // merge: start from live, remove rejected additions
    newJoys = (live.joys || []).filter(function (j) {
      var key = 'joy:added:' + j.id;
      return decisions[key] !== 'reject';
    });
    // apply rejects on added
    items.forEach(function (it) {
      if (it.domain !== 'joy' || it.op !== 'added') return;
      if (decisions[it.key] === 'reject') {
        newJoys = newJoys.filter(function (j) { return j.id !== it.id; });
      }
    });
    newActions = (live.actions || []).filter(function (a) {
      return decisions['action:added:' + a.id] !== 'reject';
    });
    newExpenses = (live.expenses || []).filter(function (e) {
      return decisions['expense:added:' + e.name] !== 'reject';
    });
  }

  // Always refresh money from live on save (SoT money from sheet)
  var newSnap = {
    at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    approved_by: opts.author || 'review_sot+living-core',
    note: opts.note || 'per-item review save',
    ranking_root: rankingRoot,
    joys: newJoys,
    actions: newActions,
    expenses: newExpenses,
    money: live.money || {},
    edges_n: live.edges_n,
    leakage: live.leakage,
    decisions: decisions,
    law: 'per-item accept/reject then save'
  };

  // Recompute leakage on chosen actions
  var customSpend = 0, customGain = 0;
  newActions.forEach(function (a) {
    if (a.kind === 'work' || !(Number(a.amountMonthly) > 0)) return;
    var onSheet = newExpenses.some(function (e) { return e.name === a.name; });
    if (onSheet) return;
    if (a.polarity === 'gain') customGain += Number(a.amountMonthly) || 0;
    else customSpend += Number(a.amountMonthly) || 0;
  });
  newSnap.leakage = {
    customSpendOffSheet: customSpend,
    customGainOffSheet: customGain,
    catalogVsLivingDebt:
      newSnap.money.living != null && newSnap.money.debtCash != null
        ? (newSnap.money.catalogSpend || 0) - (newSnap.money.living + newSnap.money.debtCash)
        : null
  };

  writeJson(baselinePath(rankingRoot), newSnap);

  // Write calendar_actions.json from accepted actions (SoT for customs)
  var actFile = path.join(rankingRoot, 'joys', 'calendar_actions.json');
  var actCat = {
    project: 'review_sot',
    law: 'actions after per-item review save',
    actions: newActions.map(function (a) {
      return {
        id: a.id,
        name: a.name,
        kind: a.kind || 'custom',
        polarity: a.polarity || 'spend',
        amountMonthly: Number(a.amountMonthly) || 0,
        cadence: a.cadence || 'daily',
        hours: a.hours || [12],
        days: a.days,
        note: a.note || '',
        author: 'living-core-review',
        at: new Date().toISOString()
      };
    }),
    updated_at: new Date().toISOString()
  };
  writeJson(actFile, actCat);

  // Clear pending proposals that were decided
  var pending = readJson(pendingPath(rankingRoot), { proposals: [] });
  var left = (pending.proposals || []).filter(function (p) {
    var key = 'proposal:pending:' + p.id;
    // remove if accept or reject decided
    return decisions[key] !== 'accept' && decisions[key] !== 'reject';
  });
  writeJson(pendingPath(rankingRoot), {
    proposals: left,
    updated_at: new Date().toISOString(),
    cleared_by_review_save: true
  });

  // expense sync contract from accepted expenses
  writeJson(path.join(reviewDir(rankingRoot), 'expense_sync.json'), {
    at: new Date().toISOString(),
    law: 'expense SoT after review save',
    expenses: newExpenses,
    money: newSnap.money,
    leakage: newSnap.leakage,
    author: opts.author || 'living-core'
  });

  appendHistory(rankingRoot, {
    op: 'apply_decisions',
    at: newSnap.approved_at,
    accepted_n: applied.length,
    rejected_n: rejected.length,
    decisions: decisions
  });

  return {
    ok: true,
    baseline_at: newSnap.approved_at,
    accepted_n: applied.length,
    rejected_n: rejected.length,
    actions_n: newActions.length,
    joys_n: newJoys.length,
    expenses_n: newExpenses.length,
    leakage: newSnap.leakage,
    path: baselinePath(rankingRoot),
    note: 'Saved per-item decisions into baseline + calendar_actions + expense_sync'
  };
}

/**
 * P62: densest REVIEW pending pack — intentional only · never auto-approve · never invent $.
 * format=toon|json · cap proposals for hop0/LLM.
 */
function densestPending(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var pending = readJson(pendingPath(rankingRoot), { proposals: [] });
  var props = Array.isArray(pending.proposals) ? pending.proposals : [];
  var cap = opts.cap != null ? Number(opts.cap) : 12;
  if (!isFinite(cap) || cap < 1) cap = 12;
  var rows = props.slice(0, cap).map(function (p) {
    var pay = p.payload || {};
    var amt =
      pay.amountMonthly != null
        ? pay.amountMonthly
        : pay.action && pay.action.amountMonthly != null
          ? pay.action.amountMonthly
          : null;
    return {
      id: p.id || '—',
      kind: p.kind || pay.discovery || '—',
      title: String(p.title || '').slice(0, 64),
      amt: amt,
      sheet: pay.sheet_only ? 1 : 0,
      status: p.status || 'pending'
    };
  });
  var money = null;
  try {
    var live = captureSnapshot(rankingRoot, opts);
    money = live && live.money
      ? {
          net: live.money.net,
          living: live.money.living,
          debt: live.money.debtCash,
          surplus: live.money.surplus
        }
      : null;
  } catch (_m) { /* */ }
  var out = {
    ok: true,
    pilot: 'P62',
    law: 'REVIEW intentional only · sheet $ SoT · never invent · never auto-approve',
    pending_n: props.length,
    shown: rows.length,
    money: money,
    proposals: rows,
    note:
      props.length > cap
        ? 'capped ' + cap + ' of ' + props.length + ' · living_ranking action=pending'
        : 'approve/reject by id only · living_ranking action=reject id=… or apply_decisions'
  };
  if (String(opts.format || '').toLowerCase() === 'toon') {
    try {
      var toon = require('./toon');
      out.toon = toon.encode
        ? toon.encode(rows, { name: 'pending' })
        : null;
    } catch (_t) {
      out.toon = null;
    }
  }
  return out;
}

function dispatch(opts) {
  opts = opts || {};
  var root = opts.ranking_root || opts.root || defaultRankingRoot();
  var action = String(opts.action || opts.op || 'review').toLowerCase();
  switch (action) {
    case 'review':
    case 'status':
    case 'diff':
      return buildReview(root, opts);
    case 'pending':
    case 'pending_dense':
    case 'review_dense':
      return densestPending(root, opts);
    case 'baseline':
    case 'approve':
    case 'approve_baseline':
      return approveBaseline(root, opts);
    case 'propose':
      return propose(root, opts);
    case 'discover':
    case 'discover_growth':
    case 'growth':
      return discoverGrowth(root, opts);
    case 'reject':
      return rejectProposal(root, opts);
    case 'expense_sync':
    case 'sync_expenses':
      return applyExpenseSync(root, opts);
    case 'snapshot':
      return { ok: true, snapshot: captureSnapshot(root, opts) };
    case 'items':
    case 'list_items':
      return { ok: true, items: listReviewItems(buildReview(root, opts)) };
    case 'apply_decisions':
    case 'save_decisions':
      return applyDecisions(root, opts);
    default:
      return {
        ok: false,
        error: 'unknown_review_action',
        actions: [
          'review',
          'pending',
          'approve',
          'propose',
          'discover',
          'reject',
          'expense_sync',
          'snapshot',
          'items',
          'apply_decisions'
        ]
      };
  }
}

module.exports = {
  defaultRankingRoot: defaultRankingRoot,
  captureSnapshot: captureSnapshot,
  buildReview: buildReview,
  densestPending: densestPending,
  approveBaseline: approveBaseline,
  propose: propose,
  discoverGrowth: discoverGrowth,
  rejectProposal: rejectProposal,
  applyExpenseSync: applyExpenseSync,
  loadWorkbookFromDisk: loadWorkbookFromDisk,
  densestWorkbookSummary: densestWorkbookSummary,
  densestLineAmt: densestLineAmt,
  listReviewItems: listReviewItems,
  applyDecisions: applyDecisions,
  dispatch: dispatch
};
