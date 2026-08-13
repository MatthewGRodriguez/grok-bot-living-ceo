/**
 * P66/P67 C1: assemble codec.hop0 opts densest from sense pieces.
 * Runtime supplies live deps; this pure-merges hop0 option object.
 */
'use strict';

/**
 * Build hop0 options object for codec.hop0(...).
 * @param {object} p pieces from sense()
 */
function assembleHop0Opts(p) {
  p = p || {};
  var modalityId = p.modalityId || 'host';
  var isHost = modalityId === 'host';
  var tv = p.tv || null;
  return {
    here: modalityId,
    path: p.path || modalityId,
    modality: modalityId,
    status: p.status || 'unknown',
    bytes: p.bytes || null,
    loop: p.loop || null,
    open_goal: p.openGoal || null,
    children_ranked: p.children || [],
    goals: p.goals || [],
    externals: isHost ? p.externals || null : null,
    nested_chain: isHost ? p.nested_chain || null : null,
    debt: p.debt && p.debt.has ? p.debt : null,
    last_invoke: isHost ? p.last_invoke || null : null,
    links: p.links || null,
    related: isHost ? p.related || null : null,
    perf: p.perf || null,
    mem: isHost ? p.mem || null : null,
    lifecycle: isHost ? p.lifecycle || null : null,
    skills: p.skills || null,
    open_next: p.open_next || null,
    forecast: p.forecast || null,
    session: p.session || null,
    why: p.why || null,
    accel: isHost ? p.accel || null : null,
    binary: isHost ? p.binary || null : null,
    loop_ok: p.loop_ok || null,
    last_capture: p.last_capture || null,
    last_lore: isHost ? p.last_lore || null : null,
    research_tail: p.research_tail || null,
    exo: p.exo || null,
    exotelos: p.exotelos || null,
    bonds_line: p.bonds_line || null,
    token_view: tv && tv.hop0 ? tv.hop0.token_view : null,
    tok_est_samples: tv && tv.hop0 ? tv.hop0.tok_est_samples : null,
    tok_save:
      tv && tv.samples_pack && tv.samples_pack.compare
        ? tv.samples_pack.compare.toon_vs_pretty
        : null,
    hidden: tv && tv.hop0 ? tv.hop0.hidden : null,
    cold: tv && tv.hop0 ? tv.hop0.cold : null,
    cold_algo: tv && tv.cold ? tv.cold.algo : null
  };
}

module.exports = {
  assembleHop0Opts: assembleHop0Opts
};
