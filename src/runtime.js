/**
 * Living-core runtime: sense → SimulatedBest → explore → Best → sample → graduate?
 * P72: densest process kernel wire (modules own logic; this file binds state + API).
 */
'use strict';

var path = require('path');
var modality = require('./modality');
var scaffold = require('./scaffold');
var densify = require('./densify');
var skillsMod = require('./skills');
var densestPages = require('./densest_pages');
var loopStateMod = require('./loop_state');
var thrashMod = require('./thrash');
var livingPerfMod = require('./living_perf');
var rankCycleMem = require('./rank_cycle_mem');
var bestEnter = require('./best_enter');
var exploreMod = require('./explore_mod');
var parentLoop = require('./parent_loop');
var captureMod = require('./capture');
var ensureRawWikiMod = require('./ensure_raw_wiki');
var livingLoreOps = require('./living_lore_ops');
var invokeDensest = require('./invoke_densest');
var runtimeStatus = require('./runtime_status');
var graduateOps = require('./graduate_ops');
var autoTickMod = require('./auto_tick');
var tokenViewDispatchMod = require('./token_view_dispatch');
var bestRun = require('./best_run');
var senseRun = require('./sense_run');
var simulatedBestMod = require('./simulated_best');
var rankCycleRun = require('./rank_cycle_run');
var hop0Bind = require('./hop0_bind');
var runtimeWriters = require('./runtime_writers');
var runtimeApi = require('./runtime_api');

function createRuntime(opts) {
  opts = opts || {};
  var rootDir = opts.rootDir || path.join(__dirname, '..');
  var registry = modality.loadRegistry(rootDir);
  var joys = modality.createSharedJoys();
  var loop = {
    phase: 'sense',
    open_goal: 'host:live',
    last_best: null,
    parent_j: null,
    simulated: false
  };
  var lastExplore = [];
  var history = [];

  function loadLoopState() {
    var href = { history: history };
    var r = loopStateMod.load(rootDir, loop, href);
    if (href.history && href.history !== history) history = href.history;
    return r;
  }
  function saveLoopState() {
    return loopStateMod.save(rootDir, loop, history);
  }
  function archiveThrashPages(o) {
    return thrashMod.archiveThrashPages(rootDir, o || {});
  }

  loadLoopState();

  function groupOpts() {
    return { rootDir: rootDir, loop: loop };
  }

  function getModality(id) {
    return registry[id] || null;
  }

  /** P71: hop0 densest helpers */
  var h0 = hop0Bind.bindHop0({
    rootDir: rootDir,
    getRegistry: function () {
      return registry;
    },
    getLoop: function () {
      return loop;
    },
    getHistory: function () {
      return history;
    }
  });

  /** P72: writers densest */
  var wr = runtimeWriters.bindWriters({
    rootDir: rootDir,
    getLoop: function () {
      return loop;
    }
  });

  /** P73 polish: capture mutates loop + persist loop_state for MCP re-enter */
  function capture(opts) {
    var r = captureMod.capture(rootDir, loop, opts || {});
    if (r && r.ok) {
      try {
        saveLoopState();
      } catch (_lsCap) { /* */ }
    }
    return r;
  }

  function ensureRawWiki(opts) {
    return ensureRawWikiMod.ensureRawWiki(rootDir, opts || {});
  }

  function livingLore(opts) {
    return livingLoreOps.livingLore(rootDir, loop, opts || {});
  }

  function setParentGoal(parentId) {
    parentLoop.setParentGoal(registry, loop, parentId);
  }

  function saveParentLoop(parentId) {
    parentLoop.saveParentLoop(loop, parentId);
  }

  function sense(modalityId) {
    return senseRun.runSense(
      Object.assign(
        {
          rootDir: rootDir,
          registry: registry,
          loop: loop,
          lastExplore: lastExplore,
          setParentGoal: setParentGoal
        },
        h0.senseHelpers()
      ),
      modalityId
    );
  }

  function simulatedBest(parentId) {
    return simulatedBestMod.runSimulatedBest(
      {
        registry: registry,
        joys: joys,
        loop: loop,
        groupOpts: groupOpts,
        setParentGoal: setParentGoal
      },
      parentId
    );
  }

  function explore(modalityId, opts) {
    opts = opts || {};
    modalityId = modalityId || 'host';
    loop.phase = 'explore';
    var result = exploreMod.explore(rootDir, registry, modalityId, opts);
    lastExplore = result.externals || [];
    return result;
  }

  function scaffoldProbe(opts) {
    var result = scaffold.scaffoldProbe(rootDir, opts || {});
    if (result.ok) {
      registry = modality.loadRegistry(rootDir);
    }
    return result;
  }

  function invoke(opts) {
    return invokeDensest.invoke(rootDir, loop, opts || {});
  }

  function resolveExternal(externalId) {
    return invokeDensest.resolveExternal(rootDir, externalId);
  }

  function enterAndSample(parentId, childId, ranked) {
    return bestEnter.enterAndSample(
      {
        rootDir: rootDir,
        registry: registry,
        joys: joys,
        groupOpts: groupOpts,
        loop: loop
      },
      parentId,
      childId,
      ranked
    );
  }

  function best(parentId) {
    return bestRun.runBest(
      {
        rootDir: rootDir,
        registry: registry,
        joys: joys,
        groupOpts: groupOpts,
        loop: loop,
        setParentGoal: setParentGoal,
        saveParentLoop: saveParentLoop,
        saveLoopState: saveLoopState,
        enterAndSample: enterAndSample,
        densestSession: h0.densestSession,
        freeGbNow: rankCycleMem.freeGbNow
      },
      parentId
    );
  }

  function rankCycle(parentIdOrOpts) {
    return rankCycleRun.runRankCycle(
      {
        rootDir: rootDir,
        registry: registry,
        densify: densify,
        loop: loop,
        ensureRawWiki: ensureRawWiki,
        setParentGoal: setParentGoal,
        sense: sense,
        simulatedBest: simulatedBest,
        explore: explore,
        best: best,
        writePerfLoopTail: wr.writePerfLoopTail,
        writeSessionTail: wr.writeSessionTail,
        crystallizeSkills: wr.crystallizeSkills,
        writeRelatedIndex: wr.writeRelatedIndex,
        saveLoopState: saveLoopState,
        archiveThrashPages: archiveThrashPages,
        getHistory: function () {
          return history;
        },
        setHistory: function (h) {
          history = h;
        }
      },
      parentIdOrOpts
    );
  }

  function livingSkill(opts) {
    return skillsMod.dispatch(rootDir, opts || {});
  }

  function status() {
    return runtimeStatus.status(rootDir, registry, loop, history);
  }

  var tokenViewDispatch = tokenViewDispatchMod.createTokenViewDispatch({
    rootDir: rootDir,
    loop: loop,
    sense: sense,
    densestSkillsFor: h0.densestSkillsFor,
    densestLinks: h0.densestLinks,
    densestRelated: h0.densestRelated,
    hostMemSignal: h0.hostMemSignal,
    archiveThrashPages: archiveThrashPages
  });

  function listModalities() {
    return runtimeStatus.listModalities(rootDir, registry);
  }

  function getDocs(modalityId) {
    return runtimeStatus.getDocs(registry, modalityId);
  }

  function reload() {
    registry = modality.loadRegistry(rootDir);
    return { ok: true, modalities: Object.keys(registry) };
  }

  function samplesRecent(n, opts) {
    return runtimeStatus.samplesRecent(rootDir, n, opts);
  }

  function samplesStats(modalityId) {
    return runtimeStatus.samplesStats(rootDir, registry, modalityId);
  }

  function graduateEval(modalityId, apply) {
    return graduateOps.graduateEval(
      rootDir,
      registry,
      wr.writeGraduateTail,
      modalityId,
      apply
    );
  }

  function revokeEval(modalityId, apply) {
    return graduateOps.revokeEval(rootDir, registry, modalityId, apply);
  }

  function audit() {
    return graduateOps.audit(rootDir, registry);
  }

  function densifyDocs(opts) {
    var pack = graduateOps.densifyDocs(rootDir, registry, opts || {});
    if (pack.registry) registry = pack.registry;
    return pack.result;
  }

  function exportVault(opts) {
    return densestPages.exportVault(rootDir, opts || {});
  }

  function livingPerf(opts) {
    return livingPerfMod.livingPerf(rootDir, loop, opts || {});
  }

  function autoTick(opts) {
    return autoTickMod.autoTick(
      { rankCycle: rankCycle, sense: sense, loop: loop },
      opts || {}
    );
  }

  /** P72: public API surface densest */
  return runtimeApi.buildPublicApi({
    rootDir: rootDir,
    loop: loop,
    sense: sense,
    simulatedBest: simulatedBest,
    explore: explore,
    best: best,
    rankCycle: rankCycle,
    autoTick: autoTick,
    exportVault: exportVault,
    livingPerf: livingPerf,
    capture: capture,
    livingLore: livingLore,
    tokenViewDispatch: tokenViewDispatch,
    status: status,
    listModalities: listModalities,
    getDocs: getDocs,
    getModality: getModality,
    reload: reload,
    scaffoldProbe: scaffoldProbe,
    invoke: invoke,
    resolveExternal: resolveExternal,
    samplesRecent: samplesRecent,
    samplesStats: samplesStats,
    graduate: graduateEval,
    revoke: revokeEval,
    audit: audit,
    densifyDocs: densifyDocs,
    livingSkill: livingSkill,
    saveLoopState: saveLoopState,
    loadLoopState: loadLoopState,
    archiveThrashPages: archiveThrashPages
  });
}

module.exports = {
  createRuntime: createRuntime
};
