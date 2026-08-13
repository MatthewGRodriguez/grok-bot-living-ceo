/**
 * P71 C1: hop0 densest helpers bound to live runtime state (extracted wrappers).
 * createRuntime owns state; this binds thin densest* for sense / token_view.
 */
'use strict';

var hop0Signals = require('./hop0_signals');
var openNextMod = require('./open_next');
var densestPages = require('./densest_pages');
var densestSkillsHop0 = require('./densest_skills_hop0');
var densestLifecycleMod = require('./densest_lifecycle');
var livingLoreOps = require('./living_lore_ops');

/**
 * @param {object} st live state accessors {
 *   rootDir, getRegistry, getLoop, getHistory, densestSkills?
 * }
 * densestSkills optional override; else uses densestSkillsHop0
 * @returns hop0 helper bag
 */
function bindHop0(st) {
  function rootDir() {
    return st.rootDir;
  }
  function registry() {
    return typeof st.getRegistry === 'function' ? st.getRegistry() : st.registry;
  }
  function loop() {
    return typeof st.getLoop === 'function' ? st.getLoop() : st.loop;
  }
  function history() {
    return typeof st.getHistory === 'function' ? st.getHistory() : st.history || [];
  }

  function densestSkills() {
    if (typeof st.densestSkills === 'function') return st.densestSkills();
    return densestSkillsHop0.densestSkills(rootDir(), loop());
  }

  function hostMemSignal() {
    return hop0Signals.hostMemSignal(loop());
  }

  function densestLastCapture() {
    return hop0Signals.densestLastCapture(rootDir(), loop());
  }

  function densestLoopOk() {
    return hop0Signals.densestLoopOk({
      loop: loop(),
      history: history(),
      registry: registry(),
      densestSkills: densestSkills,
      rootDir: rootDir()
    });
  }

  function densestAccel() {
    return hop0Signals.densestAccel({ loop: loop() });
  }

  function densestOpenNext(parentId, opts) {
    return openNextMod.densestOpenNext(
      rootDir(),
      registry(),
      parentId || 'host',
      opts || {}
    );
  }

  function densestSkillsFor(parentId) {
    return densestSkillsHop0.densestSkillsFor(
      rootDir(),
      registry(),
      loop(),
      parentId
    );
  }

  function densestLastLore() {
    return livingLoreOps.densestLastLore(rootDir(), loop());
  }

  function densestLifecycle() {
    var list = densestLifecycleMod.densestLifecycle(rootDir(), registry());
    return list && list.length ? list : null;
  }

  function modalityPath(modalityId) {
    return densestSkillsHop0.modalityPath(registry(), modalityId);
  }

  function densestLinks() {
    return densestPages.densestLinks(rootDir(), { cap: 6 });
  }

  function densestRelated() {
    return densestSkillsHop0.densestRelated(rootDir());
  }

  function densestSession() {
    return hop0Signals.densestSession(rootDir(), history());
  }

  /**
   * Sense ctx pack for sense_run (caller adds lastExplore + setParentGoal).
   */
  function senseHelpers() {
    return {
      hostMemSignal: hostMemSignal,
      densestOpenNext: densestOpenNext,
      densestSkillsFor: densestSkillsFor,
      modalityPath: modalityPath,
      densestLinks: densestLinks,
      densestRelated: densestRelated,
      densestLifecycle: densestLifecycle,
      densestSession: densestSession,
      densestLoopOk: densestLoopOk,
      densestAccel: densestAccel,
      densestLastCapture: densestLastCapture,
      densestLastLore: densestLastLore
    };
  }

  return {
    hostMemSignal: hostMemSignal,
    densestLastCapture: densestLastCapture,
    densestLoopOk: densestLoopOk,
    densestAccel: densestAccel,
    densestSkills: densestSkills,
    densestOpenNext: densestOpenNext,
    densestSkillsFor: densestSkillsFor,
    densestLastLore: densestLastLore,
    densestLifecycle: densestLifecycle,
    modalityPath: modalityPath,
    densestLinks: densestLinks,
    densestRelated: densestRelated,
    densestSession: densestSession,
    senseHelpers: senseHelpers
  };
}

module.exports = {
  bindHop0: bindHop0
};
