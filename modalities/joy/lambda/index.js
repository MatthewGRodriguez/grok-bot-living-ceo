/**
 * joy — The Joy Machine mesh root (above substrates + process kernel).
 * Ranks which substrate / process layer densest-helps the living whole.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var http = require('http');

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function mcpUp() {
  try {
    // sync-ish: presence of living-core tree + recent ceo page
    var p = path.join(rootFromLambda(), 'store', 'pages', 'ceo_self_prompt.md');
    return fs.existsSync(p);
  } catch (_e) { return false; }
}

function effectiveness(state) {
  // Root stays high-baseline; real discrimination is in children.
  if (state.simulated) return 0.88;
  return 0.92;
}

function work(state) {
  var root = rootFromLambda();
  var out = path.join(root, 'store', 'pages', 'joy_mesh_surface.md');
  var body = [
    '# joy_mesh_surface',
    '',
    '- at: ' + new Date().toISOString(),
    '- role: mesh root above mac + ash + host',
    '- law: substrates may drift; process SoT prefers densest live machine',
    '- children: mac · ash · host',
    '',
    '[[operate_ceo_grok_bot]] [[ceo_score_models]]',
    ''
  ].join('\n');
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, body, 'utf8');
    state.did = 'wrote:joy_mesh_surface.md';
  } catch (e) {
    state.did = 'joy_tick_err:' + e.message;
  }
}

function explore() { return []; }

module.exports = { effectiveness: effectiveness, work: work, explore: explore };
