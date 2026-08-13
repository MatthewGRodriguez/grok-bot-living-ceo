/**
 * ranking_bridge — living-core → review_sot (separate project).
 *
 * review_sot owns joys/jmethods/views on disk.
 * living-core discovers and writes packages there (Grok outer author).
 * Does not require ranking joy code into living-core runtime as SoT.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var rankingReview = require('./ranking_review');

function defaultRankingRoot() {
  if (process.env.REVIEW_SOT_ROOT) {
    return path.resolve(process.env.REVIEW_SOT_ROOT);
  }
  // living-core repo sibling: The Joy Machine 2/legacy/legacy/html
  return path.resolve(__dirname, '..', '..', 'legacy', 'legacy', 'html');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'joy';
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

function status(rankingRoot) {
  rankingRoot = rankingRoot || defaultRankingRoot();
  var joysDir = path.join(rankingRoot, 'joys');
  var viewsDir = path.join(rankingRoot, 'views');
  var indexPath = path.join(joysDir, 'index.json');
  var ui = path.join(rankingRoot, 'review_sot.html');
  var index = readJson(indexPath, { joys: [], views: [] });
  return {
    ok: true,
    ranking_root: rankingRoot,
    exists: fs.existsSync(rankingRoot),
    has_ui: fs.existsSync(ui),
    has_joys_dir: fs.existsSync(joysDir),
    has_views_dir: fs.existsSync(viewsDir),
    joys_n: (index.joys || []).length,
    views_n: (index.views || []).length,
    index: index,
    note: 'Separate project: living-core authors into review_sot; does not own joys as SoT'
  };
}

function listJoys(rankingRoot) {
  rankingRoot = rankingRoot || defaultRankingRoot();
  var joysDir = path.join(rankingRoot, 'joys');
  var index = readJson(path.join(joysDir, 'index.json'), { joys: [] });
  var disks = [];
  if (fs.existsSync(joysDir)) {
    fs.readdirSync(joysDir, { withFileTypes: true }).forEach(function (ent) {
      if (!ent.isDirectory()) return;
      if (ent.name === 'review') return;
      var man = path.join(joysDir, ent.name, 'MANIFEST.json');
      var m = readJson(man, null);
      disks.push({
        id: ent.name,
        manifest: m,
        has_jmethod: fs.existsSync(path.join(joysDir, ent.name, 'jmethod.js')),
        has_how: fs.existsSync(path.join(joysDir, ent.name, 'HOW.md'))
      });
    });
  }
  return { ok: true, ranking_root: rankingRoot, index: index.joys || [], disk: disks };
}

function rebuildIndex(rankingRoot) {
  rankingRoot = rankingRoot || defaultRankingRoot();
  var joysDir = path.join(rankingRoot, 'joys');
  var viewsDir = path.join(rankingRoot, 'views');
  ensureDir(joysDir);
  ensureDir(viewsDir);
  var joys = [];
  fs.readdirSync(joysDir, { withFileTypes: true }).forEach(function (ent) {
    if (!ent.isDirectory()) return;
    // review gate artifacts — not a joy package
    if (ent.name === 'review') return;
    var man = readJson(path.join(joysDir, ent.name, 'MANIFEST.json'), null);
    if (man) joys.push(man);
    else joys.push({ id: ent.name, status: 'unknown' });
  });
  var views = [];
  if (fs.existsSync(viewsDir)) {
    fs.readdirSync(viewsDir).forEach(function (f) {
      if (/\.(md|html)$/i.test(f)) views.push(f);
    });
  }
  var index = {
    project: 'review_sot',
    law: 'joys live in review_sot; living-core authors via bridge',
    joys: joys,
    views: views,
    updated_at: new Date().toISOString()
  };
  writeJson(path.join(joysDir, 'index.json'), index);
  return { ok: true, index: index, path: path.join(joysDir, 'index.json') };
}

/**
 * Write a joy package into review_sot/joys/<id>/.
 * opts: { id, title, polarity, relates_to, jmethod_js, how, research, status, force }
 */
function writeJoy(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  if (!fs.existsSync(rankingRoot)) {
    return { ok: false, error: 'review_sot_root_missing', ranking_root: rankingRoot };
  }
  var id = opts.id || ('joy_' + slugify(opts.title || 'unnamed'));
  if (!/^joy_[a-z][a-z0-9_]*$/.test(id) && !/^[a-z][a-z0-9_]*$/.test(id)) {
    id = 'joy_' + slugify(id);
  }
  if (id.indexOf('joy_') !== 0) id = 'joy_' + slugify(id);

  var dir = path.join(rankingRoot, 'joys', id);
  ensureDir(dir);
  if (fs.existsSync(path.join(dir, 'MANIFEST.json')) && !opts.force) {
    return {
      ok: false,
      error: 'already_exists',
      id: id,
      dir: dir,
      note: 'pass force=true to overwrite'
    };
  }

  var manifest = {
    id: id,
    title: opts.title || id,
    polarity: opts.polarity || 'neutral',
    status: opts.status || 'probe',
    relates_to: opts.relates_to || [],
    methods: ['score'],
    author: opts.author || 'living-core',
    at: new Date().toISOString()
  };

  var jmethod =
    opts.jmethod_js ||
    defaultJmethodStub(id, manifest.title, manifest.polarity);

  var how =
    opts.how ||
    [
      '# ' + manifest.title,
      '',
      '- id: `' + id + '`',
      '- polarity: ' + manifest.polarity,
      '- expected: densest jmethod score(ctx) models relation to other joys',
      '- author: living-core bridge',
      ''
    ].join('\n');

  fs.writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'jmethod.js'), jmethod, 'utf8');
  fs.writeFileSync(path.join(dir, 'HOW.md'), how, 'utf8');
  if (opts.research) {
    fs.writeFileSync(path.join(dir, 'RESEARCH.md'), opts.research, 'utf8');
  }

  var idx = rebuildIndex(rankingRoot);
  return {
    ok: true,
    id: id,
    dir: dir,
    manifest: manifest,
    index: idx.index,
    note: 'review_sot owns this joy; living-core authored'
  };
}

function defaultJmethodStub(id, title, polarity) {
  return [
    '/**',
    ' * ' + id + ' — ' + title,
    ' * polarity: ' + polarity,
    ' * score(ctx) → number (higher = prefer this action under parent goal)',
    ' * ctx: { x, y, X, Y, get, name, monthsTotal, monthIndex, … }',
    ' * Authored via living-core ranking_bridge.',
    ' */',
    '(function (global) {',
    "  'use strict';",
    '  function score(ctx) {',
    '    ctx = ctx || {};',
    '    var x = Math.abs(Number(ctx.x) || 0);',
    '    var y = Math.abs(Number(ctx.y) || 0);',
    "    // densest default: prefer gain/cost; refine with realistic model",
    '    if (x < 1e-9) return y;',
    '    return y / Math.sqrt(x);',
    '  }',
    '  var api = { id: ' + JSON.stringify(id) + ', score: score };',
    "  if (typeof module !== 'undefined' && module.exports && !module.exports.JBlueprint) {",
    '    module.exports = api;',
    '  } else if (typeof module !== "undefined" && module.exports) {',
    '    module.exports.RankingJoy = module.exports.RankingJoy || {};',
    '    module.exports.RankingJoy[' + JSON.stringify(id) + '] = api;',
    '  }',
    '  global.RankingJoys = global.RankingJoys || {};',
    '  global.RankingJoys[' + JSON.stringify(id) + '] = api;',
    "  if (global.JoyFactors && typeof global.JoyFactors.registerFactor === 'function') {",
    '    global.JoyFactors.registerFactor(' + JSON.stringify(id) + ', score);',
    '  }',
    "})(typeof window !== 'undefined' ? window : globalThis);",
    ''
  ].join('\n');
}

/**
 * Write a view markdown/html into review_sot/views/.
 */
function writeView(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  if (!fs.existsSync(rankingRoot)) {
    return { ok: false, error: 'review_sot_root_missing', ranking_root: rankingRoot };
  }
  var id = opts.id || slugify(opts.title || 'view');
  id = id.replace(/\.md$/i, '');
  var ext = opts.html ? '.html' : '.md';
  var file = path.join(rankingRoot, 'views', id + ext);
  ensureDir(path.dirname(file));
  if (fs.existsSync(file) && !opts.force) {
    return { ok: false, error: 'already_exists', path: file, note: 'force=true to overwrite' };
  }
  var body =
    opts.body ||
    opts.content ||
    [
      '# ' + (opts.title || id),
      '',
      '- law: use vs expected densest',
      '- author: living-core',
      '- at: ' + new Date().toISOString(),
      '',
      '## Expected',
      '- (jmethod / HOW)',
      '',
      '## Actual',
      '- (samples / Best picks — fill from living-core)',
      ''
    ].join('\n');
  fs.writeFileSync(file, body, 'utf8');
  var idx = rebuildIndex(rankingRoot);
  return { ok: true, id: id, path: file, index: idx.index };
}

/**
 * Write a file under review_sot root (safe relative path only).
 * opts: { path|rel, body|content, force }
 * Used for vendor/*.js, joys/relations.json, etc. living-core authors; review_sot owns.
 */
function writeAsset(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  if (!fs.existsSync(rankingRoot)) {
    return { ok: false, error: 'review_sot_root_missing', ranking_root: rankingRoot };
  }
  var rel = String(opts.path || opts.rel || opts.file || '').replace(/^\/+/, '');
  if (!rel || rel.indexOf('..') >= 0 || path.isAbsolute(rel)) {
    return { ok: false, error: 'bad_path', note: 'relative path under review_sot only' };
  }
  // allow common authoring targets only
  if (!/^(vendor|joys|views)\//.test(rel) && rel !== 'README_review_sot.md') {
    return {
      ok: false,
      error: 'path_not_allowed',
      note: 'path must start with vendor/ joys/ or views/'
    };
  }
  var abs = path.join(rankingRoot, rel);
  // resolve must stay under root
  if (abs.indexOf(path.resolve(rankingRoot)) !== 0) {
    return { ok: false, error: 'path_escape' };
  }
  if (fs.existsSync(abs) && !opts.force) {
    return { ok: false, error: 'already_exists', path: abs, note: 'force=true to overwrite' };
  }
  var body = opts.body != null ? opts.body : opts.content;
  if (body == null) return { ok: false, error: 'missing_body' };
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, String(body), 'utf8');
  return {
    ok: true,
    path: abs,
    rel: rel,
    bytes: Buffer.byteLength(String(body), 'utf8'),
    note: 'review_sot owns this asset; living-core authored'
  };
}


/**
 * Author a calendar action into review_sot (joys/calendar_actions.json).
 * opts: { id, name|title, polarity: gain|spend, amountMonthly, cadence, hours, days, nDays, day, month, note, kind, force }
 */
function writeAction(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  if (!fs.existsSync(rankingRoot)) {
    return { ok: false, error: 'review_sot_root_missing', ranking_root: rankingRoot };
  }
  var file = path.join(rankingRoot, 'joys', 'calendar_actions.json');
  var catalog = readJson(file, {
    project: 'review_sot',
    law: 'living-core authors calendar actions; review_sot owns SoT',
    actions: [],
    updated_at: null
  });
  if (!Array.isArray(catalog.actions)) catalog.actions = [];
  var id = opts.id || ('act_' + slugify(opts.name || opts.title || 'action'));
  if (id.indexOf('act_') !== 0 && id.indexOf('joy_') !== 0) id = 'act_' + slugify(id);
  var existing = catalog.actions.filter(function (a) { return a.id === id; })[0];
  if (existing && !opts.force) {
    return { ok: false, error: 'already_exists', id: id, note: 'force=true to overwrite' };
  }
  var kind = opts.kind || 'custom';
  var amt = Number(opts.amountMonthly != null ? opts.amountMonthly : opts.amount);
  if (!isFinite(amt)) amt = 0;
  var pol;
  if (opts.polarity === 'gain' || opts.polarity === 'produce' || opts.polarity === '+') pol = 'gain';
  else if (opts.polarity === 'neutral' || kind === 'schedule' || kind === 'joy') pol = 'neutral';
  else pol = 'spend';
  var act = {
    id: id,
    name: opts.name || opts.title || id,
    kind: kind,
    polarity: pol,
    amountMonthly: amt,
    cadence: opts.cadence || 'daily',
    hours: opts.hours || [12],
    days: opts.days,
    nDays: opts.nDays,
    day: opts.day,
    month: opts.month,
    note: opts.note || opts.how || '',
    allowWorkHours: !!opts.allowWorkHours,
    scheduleOnly: !!(opts.scheduleOnly || kind === 'schedule' || (amt === 0 && kind !== 'work')),
    enabled: opts.enabled !== false,
    section: opts.section || (kind === 'schedule' || kind === 'joy' ? 'SCHEDULE' : 'CUSTOM'),
    author: opts.author || 'living-core',
    at: new Date().toISOString()
  };
  catalog.actions = catalog.actions.filter(function (a) { return a.id !== id; });
  catalog.actions.push(act);
  catalog.updated_at = new Date().toISOString();
  writeJson(file, catalog);
  // also ensure profile seed lists them under calendar_profile if present
  return {
    ok: true,
    id: id,
    action: act,
    path: file,
    actions_n: catalog.actions.length,
    note: 'review_sot owns calendar action; living-core authored'
  };
}

function listActions(rankingRoot) {
  rankingRoot = rankingRoot || defaultRankingRoot();
  var file = path.join(rankingRoot, 'joys', 'calendar_actions.json');
  var catalog = readJson(file, { actions: [] });
  return { ok: true, path: file, actions: catalog.actions || [], catalog: catalog };
}

/**
 * Remove a calendar action by id (review_sot SoT).
 * opts: { id }
 */
function deleteAction(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || defaultRankingRoot();
  if (!fs.existsSync(rankingRoot)) {
    return { ok: false, error: 'review_sot_root_missing', ranking_root: rankingRoot };
  }
  var file = path.join(rankingRoot, 'joys', 'calendar_actions.json');
  var catalog = readJson(file, { actions: [] });
  if (!Array.isArray(catalog.actions)) catalog.actions = [];
  var id = opts.id || opts.action_id;
  if (!id) return { ok: false, error: 'id_required' };
  var before = catalog.actions.length;
  catalog.actions = catalog.actions.filter(function (a) {
    return a && a.id !== id && a.name !== id;
  });
  if (catalog.actions.length === before) {
    return { ok: false, error: 'not_found', id: id };
  }
  catalog.updated_at = new Date().toISOString();
  writeJson(file, catalog);
  return {
    ok: true,
    id: id,
    removed: true,
    actions_n: catalog.actions.length,
    path: file,
    note: 'review_sot owns calendar action catalog'
  };
}

function dispatch(opts) {
  opts = opts || {};
  var root = opts.ranking_root || opts.root || defaultRankingRoot();
  var action = String(opts.action || opts.op || 'status').toLowerCase();
  switch (action) {
    case 'status':
      return status(root);
    case 'list':
      return listJoys(root);
    case 'index':
    case 'reindex':
      return rebuildIndex(root);
    case 'write_joy':
    case 'joy':
      if (opts.propose) {
        return rankingReview.propose(root, {
          kind: 'joy',
          title: opts.title || opts.id,
          payload: opts,
          author: opts.author || 'living-core',
          note: opts.how || opts.note || 'proposed joy'
        });
      }
      return writeJoy(root, opts);
    case 'write_view':
    case 'view':
      return writeView(root, opts);
    case 'write_asset':
    case 'asset':
      return writeAsset(root, opts);
    case 'write_action':
    case 'action':
      if (opts.propose) {
        return rankingReview.propose(root, {
          kind: 'action',
          title: opts.name || opts.title || opts.id,
          payload: opts,
          author: opts.author || 'living-core',
          note: opts.note || 'proposed calendar action'
        });
      }
      return writeAction(root, opts);
    case 'delete_action':
    case 'remove_action':
      return deleteAction(root, opts);
    case 'list_actions':
      return listActions(root);
    case 'export_ics':
    case 'ics_export':
    case 'ics': {
      var ics = require('./ics');
      return ics.exportIcs(root, {
        path: opts.path,
        template_ymd: opts.template_ymd,
        calname: opts.calname || 'living-core schedule',
        living_root: opts.living_root || path.resolve(__dirname, '..')
      });
    }
    case 'import_ics':
    case 'ics_import': {
      var icsIn = require('./ics');
      return icsIn.importIcs(root, {
        path: opts.path || opts.file,
        text: opts.text || opts.body,
        apply: opts.apply === true,
        force: !!opts.force,
        author: opts.author || 'living-core-ics-import'
      });
    }
    case 'quick_add':
    case 'parse_quick': {
      var q = require('./calendar_quick');
      var parsed = q.parseQuickAdd(opts.text || opts.line || opts.name || '', {
        author: opts.author || 'living-core-quick'
      });
      if (!parsed.ok) return parsed;
      if (opts.apply === true) {
        return writeAction(
          root,
          Object.assign({}, parsed.action, {
            force: opts.force !== false,
            author: opts.author || 'living-core-quick'
          })
        );
      }
      return {
        ok: true,
        dry_run: true,
        action: parsed.action,
        law: parsed.law,
        note: 'dry_run — set apply=true to write calendar_actions'
      };
    }
    case 'free_busy':
    case 'freebusy':
    case 'fb': {
      var fb = require('./free_busy');
      var mode = String(opts.mode || opts.view || 'day').toLowerCase();
      if (mode === 'week') {
        return fb.freeBusyWeek(root, opts);
      }
      if (mode === 'vfb' || mode === 'ics') {
        return fb.freeBusyVfb(root, opts.dow != null ? opts.dow : new Date().getDay(), opts);
      }
      var dow =
        opts.dow != null
          ? opts.dow
          : opts.date
            ? new Date(opts.date + 'T12:00:00').getDay()
            : new Date().getDay();
      return fb.freeBusyForDow(root, dow, opts);
    }
    case 'review':
    case 'review_status':
    case 'pending':
    case 'pending_dense':
    case 'review_dense':
    case 'approve':
    case 'approve_baseline':
    case 'propose':
    case 'discover':
    case 'discover_growth':
    case 'growth':
    case 'reject':
    case 'expense_sync':
    case 'snapshot':
    case 'items':
    case 'list_items':
    case 'apply_decisions':
    case 'save_decisions':
      return rankingReview.dispatch(Object.assign({}, opts, { action: action === 'review_status' ? 'review' : action, ranking_root: root }));
    default:
      return {
        ok: false,
        error: 'unknown_action',
        actions: [
          'status',
          'list',
          'index',
          'write_joy',
          'write_view',
          'write_asset',
          'write_action',
          'delete_action',
          'list_actions',
          'export_ics',
          'import_ics',
          'quick_add',
          'free_busy',
          'review',
          'pending',
          'approve',
          'propose',
          'discover',
          'reject',
          'expense_sync',
          'snapshot'
        ]
      };
  }
}

module.exports = {
  defaultRankingRoot: defaultRankingRoot,
  status: status,
  listJoys: listJoys,
  rebuildIndex: rebuildIndex,
  writeJoy: writeJoy,
  writeView: writeView,
  writeAsset: writeAsset,
  writeAction: writeAction,
  deleteAction: deleteAction,
  listActions: listActions,
  review: rankingReview,
  dispatch: dispatch
};
