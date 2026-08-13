/**
 * craft — author structured pages when host needs new durable objects.
 * Soft-caps under bytes: after enough pages, no densest change → no help.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var SOFT_CAP = 6; // crafted page_* files before craft rests

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function pageCount(root) {
  var dir = path.join(root, 'store', 'pages');
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter(function (f) {
      return f.indexOf('page_') === 0;
    }).length;
  } catch (_e) {
    return 0;
  }
}

function effectiveness(state) {
  var root = rootFromLambda();
  var n = pageCount(root);
  // High when few pages; collapses when soft-capped
  if (state.simulated) {
    if (n === 0) return 0.58;
    if (n < 3) return 0.48;
    if (n < SOFT_CAP) return 0.36;
    return 0.22; // rest — let research/crystallize/data rank
  }
  if (state.helped) return 0.62;
  if (state.did === 'craft_soft_cap') return 0.2;
  return 0.28;
}

function work(state) {
  var root = rootFromLambda();
  var pages = path.join(root, 'store', 'pages');
  fs.mkdirSync(pages, { recursive: true });
  var n = pageCount(root);
  if (n >= SOFT_CAP) {
    state.helped = false;
    state.did = 'craft_soft_cap';
    return;
  }
  var stamp = new Date().toISOString().replace(/[:.]/g, '-');
  var file = path.join(pages, 'page_' + stamp + '.md');
  var loop = state.jgroup && state.jgroup.__livingLoop;
  var body = [
    '# craft page',
    '',
    '- id: page_' + stamp,
    '- at: ' + new Date().toISOString(),
    '- open_goal: ' + ((loop && loop.open_goal) || 'host:live'),
    '- authored_by: craft',
    '',
    '## object',
    'Structured durable note for host ranking experiments.',
    '',
    '## re-enter',
    'Read this page from store/pages; densest fields first.',
    ''
  ].join('\n');
  try {
    fs.writeFileSync(file, body, 'utf8');
    state.helped = true;
    state.did = 'wrote:' + path.basename(file);
  } catch (e) {
    state.helped = false;
    state.did = 'craft_error:' + e.message;
  }
}

module.exports = {
  effectiveness: effectiveness,
  work: work,
  SOFT_CAP: SOFT_CAP
};
