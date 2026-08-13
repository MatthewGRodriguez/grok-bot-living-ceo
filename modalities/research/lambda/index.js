/**
 * research — write densest findings page under store/pages.
 * Sim prior predicts densest no-op (body unchanged) so mtime-stale alone cannot farm Best.
 */
'use strict';

var fs = require('fs');
var path = require('path');

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function stripVolatile(t) {
  return String(t || '')
    .replace(/- at:.*\n/g, '')
    .replace(/- last_best_before:.*\n/g, '')
    .replace(/- parent_j:.*\n/g, '');
}

function buildStatsBlock(root) {
  try {
    var samples = require(path.join(root, 'src', 'samples'));
    var ids = ['data', 'research', 'crystallize', 'craft'];
    return ids.map(function (id) {
      var st = samples.stats(root, id);
      if (!st.n) return '- ' + id + ': n=0';
      // Coarse buckets so micro-j drift does not farm rewrites every tick
      var mj = st.mean_j != null ? (Math.round(st.mean_j * 10) / 10).toFixed(1) : '—';
      var hr = st.help_rate != null ? (Math.round(st.help_rate * 5) / 5).toFixed(1) : '—';
      var rhr = st.help_rate_recent != null ? (Math.round(st.help_rate_recent * 5) / 5).toFixed(1) : '—';
      var nBucket = st.n < 5 ? st.n : st.n < 20 ? Math.floor(st.n / 5) * 5 : Math.floor(st.n / 10) * 10;
      return '- ' + id + ': n~' + nBucket + ' mean_j~' + mj + ' help~' + hr + ' recent_help~' + rhr;
    }).join('\n');
  } catch (_e) {
    return '_none_';
  }
}

function buildCore(root, loop) {
  var openGoal = (loop && loop.open_goal) || 'host:live';
  var lastBest = (loop && loop.last_best) || '—';
  var parentJ = loop && loop.parent_j != null ? Number(loop.parent_j).toFixed(4) : '—';
  return [
    '# research_latest',
    '',
    '- open_goal: ' + openGoal,
    '- last_best_before: ' + lastBest,
    '- parent_j: ' + parentJ,
    '- modality: research',
    '',
    '## densest note',
    'Host ranks by parent-goal effectiveness under bytes; samples are recency-weighted.',
    '',
    '## outcome_tail',
    buildStatsBlock(root),
    '',
    '## open',
    '- Prefer outcome samples over static priors.',
    '- Graduation must refuse high-j empty work.',
    '- Judge did_help from durable densest change, not activity.',
    '- No-help streak explores #2 under host Best.',
    '- Sim rest when densest body would not change (no mtime farm).',
    '- Roadmap: [[roadmap_densest]] · graph: [[link_index]] · digest: [[hop0_digest]].',
    ''
  ].join('\n');
}

function wouldChange(root, loop) {
  var page = path.join(root, 'store', 'pages', 'research_latest.md');
  if (!fs.existsSync(page)) return true;
  try {
    var prev = fs.readFileSync(page, 'utf8');
    var core = buildCore(root, loop);
    return stripVolatile(prev).trim() !== stripVolatile(core).trim();
  } catch (_e) {
    return true;
  }
}

function effectiveness(state) {
  var root = rootFromLambda();
  var page = path.join(root, 'store', 'pages', 'research_latest.md');
  var exists = fs.existsSync(page);
  var loop = state.jgroup && state.jgroup.__livingLoop;
  var lastBest = loop && loop.last_best;
  var ageMs = null;
  if (exists) {
    try {
      ageMs = Date.now() - fs.statSync(page).mtimeMs;
    } catch (_e) {
      ageMs = null;
    }
  }
  var mtimeStale = !exists || ageMs == null || ageMs > 5 * 60 * 1000;

  // CEO model: prior_freshness + review_park_explore (ceo_score_models.md)
  var modelPage = path.join(root, 'store', 'pages', 'ceo_score_models.md');
  var modelMissing = !fs.existsSync(modelPage);
  var modelStale = true;
  try {
    if (!modelMissing) {
      modelStale = Date.now() - fs.statSync(modelPage).mtimeMs > 60 * 60 * 1000;
    }
  } catch (_m) { modelStale = true; }

  if (state.simulated) {
    // Densest law: only high prior when a write would change the body
    if (!exists) return 0.72;
    // Model debt outranks no-op rest — CEO must author priors
    if (modelMissing) return 0.74;
    if (modelStale && wouldChange(root, loop)) return 0.7;
    if (!wouldChange(root, loop)) return 0.26; // rest — no-op Best waste
    if (mtimeStale) return 0.68;
    if (lastBest === 'data') return 0.66;
    // Fresh mtime but densest body differs (outcome_tail buckets moved)
    return 0.58;
  }
  if (state.helped) return 0.78;
  if (state.did === 'research_unchanged') return 0.28;
  if (!exists) return 0.55;
  return 0.5;
}

function work(state) {
  var root = rootFromLambda();
  var pages = path.join(root, 'store', 'pages');
  fs.mkdirSync(pages, { recursive: true });
  var page = path.join(pages, 'research_latest.md');
  var loop = state.jgroup && state.jgroup.__livingLoop;
  var core = buildCore(root, loop);
  try {
    var prev = fs.existsSync(page) ? fs.readFileSync(page, 'utf8') : '';
    // Meta fields change every tick — densest body is what counts as help
    if (prev && stripVolatile(prev).trim() === stripVolatile(core).trim()) {
      state.helped = false;
      state.did = 'research_unchanged';
      return;
    }
    var body = core.replace(
      '# research_latest\n\n',
      '# research_latest\n\n- at: ' + new Date().toISOString() + '\n'
    );
    fs.writeFileSync(page, body, 'utf8');
    state.helped = true;
    state.did = 'wrote:research_latest.md';
  } catch (e) {
    state.helped = false;
    state.did = 'research_error:' + e.message;
  }
}

module.exports = {
  effectiveness: effectiveness,
  work: work
};
