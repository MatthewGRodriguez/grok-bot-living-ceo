/**
 * ceo_next — rankable CEO decision node under joy.
 * work(): SimulatedBest over children → write pick to ceo_next_surface + self_prompt next_act.
 */
'use strict';
var fs = require('fs');
var path = require('path');

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function surface(root) {
  return path.join(root, 'store', 'pages', 'ceo_next_surface.md');
}

function children() {
  return ['ceo_mgmt_self', 'ceo_play_adonia', 'ceo_encode_priors', 'ceo_exo_gen'];
}

function loadEff(root, id) {
  try {
    var mod = require(path.join(root, 'modalities', id, 'lambda', 'index.js'));
    var j = mod.effectiveness({ simulated: true });
    return typeof j === 'number' ? j : 0.2;
  } catch (_e) {
    return 0.15;
  }
}

function scoreChildren(root) {
  var scored = children().map(function (id) {
    return { id: id, j: loadEff(root, id) };
  });
  scored.sort(function (a, b) { return b.j - a.j; });
  return scored;
}

function stitchSelfPrompt(root, bestId, note) {
  try {
    var sp = path.join(root, 'store', 'pages', 'ceo_self_prompt.md');
    if (!fs.existsSync(sp)) return;
    var t = fs.readFileSync(sp, 'utf8');
    if (/next_act:/.test(t)) t = t.replace(/- next_act:.*$/, '- next_act: ' + bestId);
    else t = t.replace(/## current/, '## current\n\n- next_act: ' + bestId);
    if (/- ceo_next:/.test(t)) {
      t = t.replace(/- ceo_next:.*$/, '- ceo_next: in-rank Best `' + bestId + '` (' + note + ')');
    } else {
      t = t.replace(/- next_act:/, '- ceo_next: in-rank Best `' + bestId + '` (' + note + ')\n- next_act:');
    }
    fs.writeFileSync(sp, t, 'utf8');
  } catch (_e) {}
}

function effectiveness(state) {
  var root = rootFromLambda();
  var p = surface(root);
  var ageMin = 999;
  try {
    if (fs.existsSync(p)) ageMin = (Date.now() - fs.statSync(p).mtimeMs) / 60000;
  } catch (_e) {}
  if (state.simulated) {
    if (ageMin > 2) return 0.86;
    return 0.55;
  }
  if (state.did && String(state.did).indexOf('wrote:ceo_next_surface.md') === 0) return 0.7;
  if (state.did === 'ceo_next_unchanged') return 0.2;
  return ageMin > 5 ? 0.6 : 0.35;
}

function work(state) {
  var root = rootFromLambda();
  var scored = scoreChildren(root);
  var best = scored[0];
  state.ceo_best = best.id;

  var surf = surface(root);
  try {
    if (fs.existsSync(surf) && (Date.now() - fs.statSync(surf).mtimeMs) < 5 * 60 * 1000) {
      state.did = 'ceo_next_unchanged';
      state.helped = false;
      stitchSelfPrompt(root, best.id, 'cached surface');
      return;
    }
  } catch (_e) {}

  var at = new Date().toISOString();
  var lines = [
    '# ceo_next_surface',
    '',
    '- at: ' + at,
    '- modality: ceo_next',
    '- law: in-rank CEO-next (Matthew) · not prose-only',
    '- best: `' + best.id + '` (j=' + best.j.toFixed(3) + ')',
    '',
    '## SimulatedBest children',
    '',
    '| child | j_sim |',
    '|-------|------:|'
  ];
  scored.forEach(function (r) {
    lines.push('| `' + r.id + '` | ' + r.j.toFixed(3) + ' |');
  });
  lines.push('');
  lines.push('## models');
  lines.push('');
  lines.push('- ceo_in_rank · self_as_agent · mgmt_research_before_stack · starved_grid_boost · one_aimed_act');
  lines.push('');
  lines.push('[[research_better_ceo]] [[ceo_self_prompt]] [[explore_quality]]');
  lines.push('');
  try {
    fs.writeFileSync(surf, lines.join('\n'), 'utf8');
    stitchSelfPrompt(root, best.id, 'from ceo_next SimulatedBest');
    state.did = 'wrote:ceo_next_surface.md';
    state.helped = true;
  } catch (e) {
    state.did = 'ceo_next_err:' + e.message;
    state.helped = false;
  }
}

function explore() { return []; }

module.exports = { effectiveness: effectiveness, work: work, explore: explore };
