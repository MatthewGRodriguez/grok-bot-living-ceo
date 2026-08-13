/**
 * samples — trim effectiveness_samples.jsonl under data.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var SOFT_CAP = 120;
var HARD_KEEP = 90;

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function samplePath(root) {
  return path.join(root, 'store', 'pages', 'effectiveness_samples.jsonl');
}

function lineCount(p) {
  if (!fs.existsSync(p)) return 0;
  try {
    var t = fs.readFileSync(p, 'utf8');
    return t.split('\n').filter(Boolean).length;
  } catch (_e) {
    return 0;
  }
}

function effectiveness(state) {
  var root = rootFromLambda();
  var n = lineCount(samplePath(root));
  if (state.simulated) {
    // Dominate layer when over soft cap so trim actually gets Best
    if (n > SOFT_CAP * 1.5) return 0.88;
    if (n > SOFT_CAP) return 0.82;
    if (n > 80) return 0.4;
    return 0.28;
  }
  if (state.helped) return 0.7;
  if (state.did === 'samples_under_cap') return 0.24;
  return 0.35;
}

function work(state) {
  var root = rootFromLambda();
  var p = samplePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) {
    state.helped = false;
    state.did = 'samples_missing';
    return;
  }
  var lines;
  try {
    lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  } catch (e) {
    state.helped = false;
    state.did = 'samples_error:' + e.message;
    return;
  }
  if (lines.length <= SOFT_CAP) {
    state.helped = false;
    state.did = 'samples_under_cap';
    return;
  }
  var keep = lines.slice(-HARD_KEEP);
  try {
    fs.writeFileSync(p, keep.join('\n') + '\n', 'utf8');
    state.helped = true;
    state.did = 'trimmed_samples:' + lines.length + '→' + keep.length;
  } catch (e2) {
    state.helped = false;
    state.did = 'samples_error:' + e2.message;
  }
}

module.exports = {
  effectiveness: effectiveness,
  work: work,
  SOFT_CAP: SOFT_CAP
};
