/**
 * data modality — durable attention store + nested child pipeline entry.
 */
'use strict';

var fs = require('fs');
var path = require('path');

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function storeStats(root) {
  var pages = path.join(root, 'store', 'pages');
  var exportsDir = path.join(root, 'store', 'exports');
  var pageN = 0;
  var exportN = 0;
  try {
    if (fs.existsSync(pages)) {
      pageN = fs.readdirSync(pages).filter(function (f) {
        return !f.startsWith('.');
      }).length;
    }
    if (fs.existsSync(exportsDir)) {
      exportN = fs.readdirSync(exportsDir).filter(function (f) {
        return !f.startsWith('.');
      }).length;
    }
  } catch (_e) { /* */ }
  return { pageN: pageN, exportN: exportN };
}

function debt(root) {
  try {
    return require(path.join(root, 'src', 'debt')).dataDebt(root);
  } catch (_e) {
    return { has: false, reasons: [], score: 0 };
  }
}

function effectiveness(state) {
  var root = rootFromLambda();
  var st = storeStats(root);
  var d = debt(root);
  // When densest debt exists, outrank research/crystallize so host enters data
  if (d.has) {
    var boost = 0.72 + 0.2 * d.score;
    if (boost > 0.92) boost = 0.92;
    return state.simulated ? boost : boost + (state.helped ? 0.04 : 0);
  }
  // Quiet path: healthy store rests so research/crystallize can rotate
  var base = state.simulated ? 0.42 : 0.48;
  if (st.pageN === 0 && st.exportN === 0) base = state.simulated ? 0.78 : 0.8;
  else if (st.pageN >= 3) base -= 0.04;
  if (state.helped) base += 0.05;
  if (state.did === 'store_already_healthy') base -= 0.14;
  if (base > 0.9) base = 0.9;
  if (base < 0.2) base = 0.2;
  return base;
}

function work(state) {
  var root = rootFromLambda();
  var store = path.join(root, 'store');
  try {
    fs.mkdirSync(path.join(store, 'exports'), { recursive: true });
    fs.mkdirSync(path.join(store, 'pages'), { recursive: true });
    // P25: raw layer (immutable sources) densest
    fs.mkdirSync(path.join(store, 'raw'), { recursive: true });
    var indexPath = path.join(store, 'pages', 'data_index.md');
    var st = storeStats(root);
    var d = debt(root);
    var prev = '';
    try {
      if (fs.existsSync(indexPath)) prev = fs.readFileSync(indexPath, 'utf8');
    } catch (_e) { /* */ }
    // Align densest core with pages modality (single owner of data_index shape)
    var craftN = 0;
    try {
      craftN = fs.readdirSync(path.join(store, 'pages')).filter(function (f) {
        return f.indexOf('page_') === 0;
      }).length;
    } catch (_c) { /* */ }
    var rawN = 0;
    try {
      var rawDir = path.join(store, 'raw');
      if (fs.existsSync(rawDir)) {
        rawN = fs.readdirSync(rawDir).filter(function (f) {
          return f !== 'README.md' && !f.startsWith('.');
        }).length;
      }
    } catch (_r) { /* */ }
    var core = [
      '# data_index',
      '',
      '- pages: ' + st.pageN,
      '- craft_pages: ' + craftN,
      '- raw: ' + rawN,
      '- densest: research_latest, hop0_digest, data_index, wiki_law',
      '- law: densest first under data · raw=immutable · pages=wiki',
      ''
    ].join('\n');
    // Real debt reasons only when present — never write "debt: none" (false marker)
    if (d.has) {
      core = core.replace(
        '- law: densest first under data\n',
        '- debt: ' + d.reasons.slice(0, 4).join(',') + '\n- law: densest first under data\n'
      );
    }
    var prevCore = prev.replace(/- at:.*\n/g, '');
    var changed = prevCore.trim() !== core.trim();
    if (changed || !prev || d.has) {
      var body = core.replace(
        '# data_index\n\n',
        '# data_index\n\n- at: ' + new Date().toISOString() + '\n'
      );
      fs.writeFileSync(indexPath, body, 'utf8');
      state.helped = true;
      state.did = d.has
        ? 'ensure_store+debt:' + d.reasons.slice(0, 3).join('+')
        : 'ensure_store+data_index';
      state.debt = d;
    } else {
      state.helped = false;
      state.did = 'store_already_healthy';
      state.debt = d;
    }
  } catch (e) {
    state.helped = false;
    state.did = 'store_error:' + e.message;
  }
}

module.exports = {
  effectiveness: effectiveness,
  work: work
};
