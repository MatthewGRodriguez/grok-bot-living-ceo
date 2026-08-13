/**
 * exports — store/exports surface under data.
 */
'use strict';

var fs = require('fs');
var path = require('path');

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function effectiveness(state) {
  var root = rootFromLambda();
  var dir = path.join(root, 'store', 'exports');
  var indexPath = path.join(dir, 'exports_index.md');
  var n = 0;
  try {
    if (fs.existsSync(dir)) {
      n = fs.readdirSync(dir).filter(function (f) {
        return !f.startsWith('.') && f !== 'exports_index.md';
      }).length;
    }
  } catch (_e) { /* */ }
  var hasIndex = fs.existsSync(indexPath);
  // P9: re-enter when craft exports are densest-fresh (surface poster/svg/html)
  var freshCraft = false;
  try {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(function (f) {
        if (f.indexOf('living_') !== 0 && f.indexOf('.svg') < 0 && f.indexOf('.html') < 0) {
          return;
        }
        var st = fs.statSync(path.join(dir, f));
        if (Date.now() - st.mtimeMs < 30 * 60 * 1000) freshCraft = true;
      });
    }
  } catch (_f) { /* */ }
  if (state.simulated) {
    if (!fs.existsSync(dir)) return 0.68;
    if (!hasIndex) return 0.6;
    if (n === 0) return 0.45;
    if (freshCraft) return 0.52; // P9 re-enter after intentional surface craft
    return 0.32;
  }
  if (state.helped) return 0.7;
  if (state.did === 'exports_current') return 0.26;
  return 0.38;
}

function work(state) {
  var root = rootFromLambda();
  var dir = path.join(root, 'store', 'exports');
  fs.mkdirSync(dir, { recursive: true });
  var files = [];
  try {
    files = fs.readdirSync(dir).filter(function (f) {
      return !f.startsWith('.') && f !== 'exports_index.md';
    }).sort();
  } catch (_e) { /* */ }
  var core = [
    '# exports_index',
    '',
    '- count: ' + files.length,
    '- densest: list names only',
    ''
  ].concat(files.slice(0, 40).map(function (f) {
    return '- ' + f;
  })).concat(['']);
  var bodyCore = core.join('\n');
  var indexPath = path.join(dir, 'exports_index.md');
  var prev = '';
  try {
    if (fs.existsSync(indexPath)) prev = fs.readFileSync(indexPath, 'utf8');
  } catch (_e2) { /* */ }
  var prevCore = prev.replace(/- at:.*\n/g, '');
  if (prevCore.trim() === bodyCore.trim()) {
    state.helped = false;
    state.did = 'exports_current';
    return;
  }
  var body = bodyCore.replace(
    '# exports_index\n\n',
    '# exports_index\n\n- at: ' + new Date().toISOString() + '\n'
  );
  try {
    fs.writeFileSync(indexPath, body, 'utf8');
    state.helped = true;
    state.did = 'wrote:exports_index.md';
  } catch (e) {
    state.helped = false;
    state.did = 'exports_error:' + e.message;
  }
}

module.exports = {
  effectiveness: effectiveness,
  work: work
};
