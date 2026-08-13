/**
 * P70 C1: sense pipeline densest (extracted from createRuntime).
 * Assembles hop0 via hop0_assemble · sense_core · hop0_signals.
 *
 * ctx: {
 *   rootDir, registry, loop, lastExplore,
 *   setParentGoal, hostMemSignal, densestOpenNext, densestSkillsFor,
 *   modalityPath, densestLinks, densestRelated, densestLifecycle,
 *   densestSession, densestLoopOk, densestAccel, densestLastCapture,
 *   densestLastLore
 * }
 */
'use strict';

var codec = require('./codec');
var tokenView = require('./token_view');
var bytesMod = require('./bytes');
var binaryBoundary = require('./binary_boundary');
var senseCore = require('./sense_core');
var hop0Assemble = require('./hop0_assemble');

/**
 * Sense one modality; return hop0 pack.
 * @param {object} ctx
 * @param {string} [modalityId]
 */
function runSense(ctx, modalityId) {
  modalityId = modalityId || 'host';
  var rootDir = ctx.rootDir;
  var registry = ctx.registry;
  var loop = ctx.loop;

  loop.phase = 'sense';
  ctx.setParentGoal(modalityId);
  var m = registry[modalityId];
  var b = bytesMod.measure(rootDir);
  var children = senseCore.rankedChildren(registry, modalityId);
  ctx.setParentGoal(modalityId);
  var openGoal = senseCore.resolveOpenGoal(m, loop);
  var debtInfo = senseCore.resolveDebt(rootDir, modalityId);
  var tv = null;
  if (modalityId === 'host') {
    try {
      var memSig = ctx.hostMemSignal();
      tv = tokenView.status(rootDir, {
        free_gb: memSig && memSig.free_gb,
        recent_n: 8,
        format: 'toon'
      });
    } catch (_tv) {
      tv = null;
    }
  }
  var openNextLine = ctx.densestOpenNext(modalityId, {
    open_goal: openGoal || (loop && loop.open_goal) || ''
  });
  var skillsLine = ctx.densestSkillsFor(modalityId);
  var forecastLine = senseCore.resolveForecast({
    open_next: openNextLine,
    debt: debtInfo,
    skills: skillsLine,
    last_best: loop.last_best,
    last_why: loop.last_why || null,
    no_help_streak: loop.no_help_streak,
    open_goal: openGoal || (loop && loop.open_goal),
    parent: modalityId,
    here: modalityId,
    bonds: (m && m.bonds) || []
  });
  var whyLocal = senseCore.resolveWhyLocal(loop, modalityId);
  var hop = codec.hop0(
    hop0Assemble.assembleHop0Opts({
      modalityId: modalityId,
      path: ctx.modalityPath(modalityId),
      status: m ? m.status : 'unknown',
      bytes: b,
      loop: loop,
      openGoal: openGoal,
      children: children,
      goals: m ? m.goals : [],
      externals: ctx.lastExplore || [],
      nested_chain: loop.last_nested,
      debt: debtInfo,
      last_invoke: loop.last_invoke,
      links: ctx.densestLinks(),
      related: ctx.densestRelated(),
      perf: loop.last_timing || null,
      mem: ctx.hostMemSignal(),
      lifecycle: ctx.densestLifecycle(),
      skills: skillsLine,
      open_next: openNextLine,
      forecast: forecastLine,
      session: ctx.densestSession(),
      why: whyLocal,
      accel: ctx.densestAccel(),
      binary: (function () {
        try {
          return binaryBoundary.status(rootDir, {}).hop0;
        } catch (_b) {
          return null;
        }
      })(),
      loop_ok: ctx.densestLoopOk(),
      // P76: captures_tail SoT via densestLastCapture (not stale loop.first)
      last_capture: (typeof ctx.densestLastCapture === 'function'
        ? ctx.densestLastCapture()
        : null) || loop.last_capture,
      last_lore: loop.last_lore || ctx.densestLastLore(),
      research_tail: senseCore.researchTail(m),
      exo: m && m.exotelos ? require('./exotelos').hop0Line(m.exotelos) : null,
      exotelos: m && m.exotelos ? m.exotelos : null,
      bonds_line:
        m && m.bonds && m.bonds.length
          ? require('./exotelos').hop0BondsLine(m.bonds)
          : null,
      tv: tv
    })
  );
  return {
    ok: true,
    hop0: hop,
    modality: modalityId,
    children: children,
    bytes: b,
    loop: Object.assign({}, loop),
    token_view: tv,
    docs_summary: senseCore.docsSummary(m)
  };
}

module.exports = {
  runSense: runSense
};
