/**
 * host — process kernel under joy.
 * Models: process_under_bytes · hands_fail_closed_money · infra_pulse_before_rank
 * Law: host_tick with no child help must NOT win joy Best (anti thrash).
 */
'use strict';
var fs = require('fs');
var path = require('path');

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function loopNoHelpHost(root) {
  try {
    var p = path.join(root, 'store', 'cold', 'loop_state.json');
    if (!fs.existsSync(p)) {
      // fall back: ceo_self_prompt / hop0 session file not required
      return false;
    }
    var j = JSON.parse(fs.readFileSync(p, 'utf8'));
    var by = (j.by_parent && j.by_parent.joy) || (j.by_parent && j.by_parent.host) || {};
    if ((by.no_help_streak || 0) >= 2) return true;
    if (by.last_no_help_id === 'host') return true;
  } catch (_e) {}
  // session rhyme from last captures in ceo_self_prompt
  try {
    var t = fs.readFileSync(path.join(root, 'store', 'pages', 'ceo_self_prompt.md'), 'utf8');
    if (/host\/N.*host\/N/.test(t) || /host_tick help=N/.test(t)) return true;
  } catch (_e2) {}
  return false;
}

function effectiveness(state) {
  var root = rootFromLambda();
  var demote = loopNoHelpHost(root);
  if (state.simulated) {
    if (demote) return 0.35; // yield to handoff/ash/mac
    return 0.72;
  }
  if (state.did === 'host_tick') return demote ? 0.12 : 0.25;
  if (demote) return 0.2;
  return 0.55;
}

function work(state) {
  // Prefer not to claim work when demoted — mark skip so judge sees no fake help
  var root = rootFromLambda();
  if (loopNoHelpHost(root)) {
    state.did = 'host_yield_to_children';
    state.helped = false;
    return;
  }
  state.did = 'host_tick';
}

function explore() { return []; }

module.exports = { effectiveness: effectiveness, work: work, explore: explore };
