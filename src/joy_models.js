/**
 * joy_models — multi-model joy relationships (not money→happy only).
 *
 * Law: review_sot owns joy packages as SoT; living-core explores models,
 * densifies catalog, proposes discoveries into REVIEW. Never invents $.
 */
'use strict';

var fs = require('fs');
var path = require('path');

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

/**
 * Catalog of realistic models. Each is a lens over joy↔joy edges + sheet signals.
 * money_to_happy is one baseline — not the only world model.
 */
function catalogModels() {
  return [
    {
      id: 'money_to_happy',
      title: 'Money → happiness trade',
      status: 'baseline',
      class: 'tradeoff',
      joys: ['joy_money', 'joy_age_happiness', 'joy_external'],
      edges: [
        { from: 'joy_money', to: 'joy_age_happiness', label: 'spend utility age-weighted' },
        { from: 'joy_external', to: 'joy_money', label: 'noise on every spend' }
      ],
      sheet: ['net', 'living', 'catalogSpend'],
      law: 'classic Exp6 one-axis · depreciation · not the only model',
      explore: 'keep as baseline; never sole ranking lens'
    },
    {
      id: 'debt_vs_freedom',
      title: 'Debt urgency vs surplus freedom',
      status: 'active',
      class: 'tradeoff',
      joys: ['joy_debt_urgency', 'joy_surplus_freedom', 'joy_money'],
      edges: [
        { from: 'joy_debt_urgency', to: 'joy_surplus_freedom', label: 'extra pay shrinks surplus now' },
        { from: 'joy_surplus_freedom', to: 'joy_debt_urgency', label: 'free cash can cut high-APR' }
      ],
      sheet: ['debtCash', 'surplus', 'dti', 'debts.apr'],
      law: 'headroom ≤ surplus · sheet DEBTS APR ranks payoff target',
      explore: 'discover debt_extra actions; cut leisure → more headroom'
    },
    {
      id: 'time_attention',
      title: 'Calendar time as scarce resource',
      status: 'active',
      class: 'resource',
      joys: ['joy_calendar', 'joy_money', 'joy_age_happiness', 'joy_surplus_freedom'],
      edges: [
        { from: 'joy_calendar', to: 'joy_money', label: 'slots carry expense $' },
        { from: 'joy_calendar', to: 'joy_age_happiness', label: 'years advance age t' },
        { from: 'joy_surplus_freedom', to: 'joy_calendar', label: 'free hours after obligations' }
      ],
      sheet: ['calendar_actions', 'work 15–23 CST'],
      law: 'time SoT = calendar_actions · $ SoT = sheet · never invent spend on slots',
      explore: 'schedule-only growth (walk, debt-review); free-busy conflicts'
    },
    {
      id: 'age_horizon',
      title: 'Life-stage weights on happiness & debt',
      status: 'active',
      class: 'lifecycle',
      joys: ['joy_age_happiness', 'joy_debt_urgency', 'joy_surplus_freedom', 'joy_external'],
      edges: [
        { from: 'joy_age_happiness', to: 'joy_debt_urgency', label: 'high APR into age is costly' },
        { from: 'joy_age_happiness', to: 'joy_surplus_freedom', label: 'late life values free surplus' },
        { from: 'joy_external', to: 'joy_age_happiness', label: 'noise amplitude flat across age' }
      ],
      sheet: ['hdame.years', 'horizon'],
      law: 'age reshapes H side of spend · external does not dampen',
      explore: 'horizon years from calendar · not a manual HDAME tab'
    },
    {
      id: 'housing_bah_growth',
      title: 'Housing / BAH structural income',
      status: 'explore',
      class: 'growth',
      joys: ['joy_money', 'joy_surplus_freedom', 'joy_age_happiness'],
      edges: [
        { from: 'joy_money', to: 'joy_surplus_freedom', label: 'BAH filled → higher net when sheet updated' }
      ],
      sheet: ['INCOME.BAH', 'Meal Deduction', 'BAS'],
      law: 'never invent BAH $ · barracks pattern → research locality rate on sheet',
      explore: 'discover bah_moveout note; housing_stability joy candidate'
    },
    {
      id: 'cut_vs_payoff',
      title: 'Cut leisure vs debt extra pay',
      status: 'active',
      class: 'decision',
      joys: ['joy_money', 'joy_debt_urgency', 'joy_surplus_freedom', 'joy_age_happiness'],
      edges: [
        { from: 'joy_money', to: 'joy_surplus_freedom', label: 'cut sheet leisure → wiggle' },
        { from: 'joy_debt_urgency', to: 'joy_money', label: 'principal pay frees future M' }
      ],
      sheet: ['leisure expenses', 'surplus'],
      law: 'both free headroom · cut is permanent line zero · payoff is balance reduction',
      explore: 'rank cuttable lines + payoff targets side by side in discover'
    },
    {
      id: 'rest_and_energy',
      title: 'Rest / recovery vs work drain',
      status: 'probe',
      class: 'health',
      joys: ['joy_calendar', 'joy_age_happiness', 'joy_external'],
      candidate_joys: ['joy_rest_recovery', 'joy_health_energy'],
      edges: [
        { from: 'joy_calendar', to: 'joy_age_happiness', label: 'recovery blocks raise H without invent $' }
      ],
      sheet: ['act_work hours', 'act_recovery'],
      law: '$0 schedule actions · energy not a money invent',
      explore: 'propose joy_rest_recovery + recovery schedule if missing'
    },
    {
      id: 'social_belonging',
      title: 'Social / belonging vs isolation',
      status: 'probe',
      class: 'social',
      joys: ['joy_age_happiness', 'joy_calendar', 'joy_surplus_freedom', 'joy_external'],
      candidate_joys: ['joy_social_belong'],
      edges: [
        { from: 'joy_age_happiness', to: 'joy_calendar', label: 'outings schedule raise H' },
        { from: 'joy_external', to: 'joy_age_happiness', label: 'social noise / FOMO' }
      ],
      sheet: ['surplus for paid outings optional'],
      law: 'free walk first · paid outing only from surplus on sheet',
      explore: 'act_social_out · joy_social_belong probe package'
    },
    {
      id: 'skill_growth',
      title: 'Skill / craft growth vs leisure drain',
      status: 'probe',
      class: 'growth',
      joys: ['joy_calendar', 'joy_age_happiness', 'joy_money', 'joy_surplus_freedom'],
      candidate_joys: ['joy_skill_growth'],
      edges: [
        { from: 'joy_calendar', to: 'joy_age_happiness', label: 'focus blocks compound H over years' },
        { from: 'joy_money', to: 'joy_calendar', label: 'tools/subs may fund skill or pure leisure' }
      ],
      sheet: ['Apple Dev', 'Digital Ocean', 'Focus block'],
      law: 'distinguish growth tools vs pure leisure cut when scoring',
      explore: 'tag sheet lines growth vs leisure · joy_skill_growth candidate'
    },
    {
      id: 'obligation_stack',
      title: 'Obligation stack (living + debt + work)',
      status: 'active',
      class: 'constraint',
      joys: ['joy_money', 'joy_debt_urgency', 'joy_calendar', 'joy_surplus_freedom'],
      edges: [
        { from: 'joy_calendar', to: 'joy_debt_urgency', label: 'bill hours fixed' },
        { from: 'joy_money', to: 'joy_surplus_freedom', label: 'what remains after stack' }
      ],
      sheet: ['living', 'debtCash', 'work days'],
      law: 'surplus = net − living − debt · obligations first',
      explore: 'free-busy after work+debt hours · remaining slots for H growth'
    }
  ];
}

function modelsPath(rankingRoot) {
  return path.join(rankingRoot || defaultRankingRoot(), 'joys', 'models.json');
}

function pagePath(livingRoot) {
  return path.join(livingRoot, 'store', 'pages', 'joy_models.md');
}

function densestBody(opts) {
  opts = opts || {};
  var models = catalogModels();
  var money = opts.money || {};
  var at = new Date().toISOString();
  var lines = [
    '# joy_models',
    '',
    '- at: ' + at,
    '- law: money→happy is ONE model · explore many · sheet $ SoT · never invent',
    '- modality: joy_models · parent host · discovery → REVIEW propose',
    '- money_sot: net=' +
      (money.net != null ? money.net : '?') +
      ' surplus=' +
      (money.surplus != null ? money.surplus : '?') +
      ' debtCash=' +
      (money.debtCash != null ? money.debtCash : '?'),
    '',
    '## models (lenses)',
    '',
    '| id | title | status | class | joys densest |',
    '|----|-------|--------|-------|--------------|'
  ];
  models.forEach(function (m) {
    lines.push(
      '| `' +
        m.id +
        '` | ' +
        m.title +
        ' | ' +
        m.status +
        ' | ' +
        m.class +
        ' | ' +
        (m.joys || []).join(', ') +
        ' |'
    );
  });
  lines.push('');
  lines.push('## per-model densest');
  lines.push('');
  models.forEach(function (m) {
    lines.push('### ' + m.id);
    lines.push('- title: ' + m.title);
    lines.push('- status: ' + m.status + ' · class: ' + m.class);
    lines.push('- law: ' + m.law);
    lines.push('- sheet: ' + (m.sheet || []).join('; '));
    lines.push('- explore: ' + m.explore);
    if (m.candidate_joys && m.candidate_joys.length) {
      lines.push('- candidate_joys: ' + m.candidate_joys.join(', '));
    }
    (m.edges || []).forEach(function (e) {
      lines.push('- edge: ' + e.from + ' → ' + e.to + ' · ' + e.label);
    });
    lines.push('');
  });
  lines.push('## operate');
  lines.push('');
  lines.push('```');
  lines.push('living_sense');
  lines.push('living_best parent=host   # may pick joy_models');
  lines.push('living_ranking action=discover   # multi-model + sheet growth');
  lines.push('# REVIEW accept → top Save (localStorage)');
  lines.push('```');
  lines.push('');
  lines.push('## law');
  lines.push('');
  lines.push('1. Money→happy is baseline, not monopoly.');
  lines.push('2. New joys/models enter via REVIEW propose — never silent SoT.');
  lines.push('3. Sheet $ only; schedule actions default $0.');
  lines.push('4. review_sot JOYS tab surfaces this catalog (models.json).');
  lines.push('');
  lines.push('## links');
  lines.push('');
  lines.push('- [[operate_discovery]] · [[calendar_layers]] · review_sot JOYS · joys/relations.json');
  lines.push('');
  return lines.join('\n');
}

function stripVolatile(s) {
  return String(s || '')
    .replace(/^- at:.*$/gm, '')
    .replace(/^- money_sot:.*$/gm, '');
}

/**
 * Write models.json into review_sot + densest page into living-core.
 */
function writeCatalog(livingRoot, rankingRoot, opts) {
  opts = opts || {};
  livingRoot = livingRoot || path.resolve(__dirname, '..');
  rankingRoot = rankingRoot || defaultRankingRoot();
  var models = catalogModels();
  var money = opts.money || null;
  if (!money) {
    try {
      var rr = require('./ranking_review');
      var snap = rr.captureSnapshot(rankingRoot, opts);
      money = (snap && snap.money) || {};
    } catch (_e) {
      money = {};
    }
  }
  var payload = {
    project: 'review_sot',
    law: 'multi-model joy lenses · money→happy is one · living-core explores · never invent $',
    modality: 'joy_models',
    at: new Date().toISOString(),
    money: money,
    models: models,
    models_n: models.length
  };
  writeJson(modelsPath(rankingRoot), payload);

  // densest view for review_sot JOYS fetch
  try {
    var viewsDir = path.join(rankingRoot, 'views');
    ensureDir(viewsDir);
    fs.writeFileSync(
      path.join(viewsDir, 'joy_models.md'),
      densestBody({ money: money }),
      'utf8'
    );
  } catch (_v) { /* */ }

  var page = pagePath(livingRoot);
  var body = densestBody({ money: money });
  var prev = '';
  try {
    if (fs.existsSync(page)) prev = fs.readFileSync(page, 'utf8');
  } catch (_r) { /* */ }
  var changed = stripVolatile(prev).trim() !== stripVolatile(body).trim();
  if (changed) {
    ensureDir(path.dirname(page));
    fs.writeFileSync(page, body, 'utf8');
  }
  return {
    ok: true,
    changed: changed,
    models_n: models.length,
    path_models: modelsPath(rankingRoot),
    path_page: page,
    money: money
  };
}

/**
 * Discovery candidates from multi-model catalog (joy probes + model notes).
 * Does not invent money. Kind: note | joy.
 */
function discoverModelCandidates(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  var models = catalogModels();
  var joysDir = path.join(rankingRoot, 'joys');
  var existing = Object.create(null);
  try {
    if (fs.existsSync(joysDir)) {
      fs.readdirSync(joysDir, { withFileTypes: true }).forEach(function (ent) {
        if (ent.isDirectory() && ent.name.indexOf('joy_') === 0) existing[ent.name] = true;
      });
    }
  } catch (_e) { /* */ }

  var candidates = [];
  // headroom model card
  candidates.push({
    id: 'disc_model_catalog',
    kind: 'note',
    title: 'Joy models · ' + models.length + ' lenses (money→happy is one)',
    body:
      'Multi-model catalog active: ' +
      models
        .map(function (m) {
          return m.id;
        })
        .join(', ') +
      '. review_sot JOYS surfaces joys/models.json · living-core modality joy_models explores. Never invent $.',
    payload: {
      discovery: 'joy_models',
      models_n: models.length,
      model_ids: models.map(function (m) {
        return m.id;
      })
    }
  });

  models.forEach(function (m) {
    if (m.status === 'baseline') return;
    candidates.push({
      id: 'disc_model_' + m.id,
      kind: 'note',
      title: 'Model · ' + m.title,
      body:
        '[' +
        m.status +
        '/' +
        m.class +
        '] ' +
        m.law +
        ' · joys: ' +
        (m.joys || []).join(', ') +
        ' · explore: ' +
        m.explore +
        ' · sheet: ' +
        (m.sheet || []).join('; '),
      payload: {
        discovery: 'joy_model',
        model_id: m.id,
        model: m,
        relates_to: m.joys || []
      }
    });
    (m.candidate_joys || []).forEach(function (jid) {
      if (existing[jid]) return;
      candidates.push({
        id: 'disc_joycand_' + jid,
        kind: 'joy',
        title: 'Candidate joy · ' + jid + ' (model ' + m.id + ')',
        body:
          'Probe joy package for model ' +
          m.id +
          '. Accept in REVIEW → living-core may write_joy (propose). ' +
          'No $ invent. ' +
          m.explore,
        payload: {
          discovery: 'candidate_joy',
          model_id: m.id,
          joy: {
            id: jid,
            title: jid.replace(/^joy_/, '').replace(/_/g, ' '),
            polarity: jid.indexOf('debt') >= 0 || jid.indexOf('cost') >= 0 ? 'cost' : 'neutral',
            status: 'probe',
            relates_to: m.joys || [],
            how:
              'Candidate from joy_models/' +
              m.id +
              '. Author jmethod via living-core write_joy after REVIEW accept. Sheet $ SoT.'
          }
        }
      });
    });
  });

  return { ok: true, candidates: candidates, models_n: models.length };
}

module.exports = {
  defaultRankingRoot: defaultRankingRoot,
  catalogModels: catalogModels,
  densestBody: densestBody,
  writeCatalog: writeCatalog,
  discoverModelCandidates: discoverModelCandidates,
  modelsPath: modelsPath,
  pagePath: pagePath,
  stripVolatile: stripVolatile
};
