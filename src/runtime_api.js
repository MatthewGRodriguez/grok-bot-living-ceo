/**
 * P72 C1: createRuntime public API surface densest (extracted).
 * Assembles MCP/runtime method bag — no process logic.
 */
'use strict';

var samples = require('./samples');
var livingRankingOps = require('./living_ranking_ops');

/**
 * @param {object} m method bag (already bound to live state)
 * @returns public runtime API
 */
function buildPublicApi(m) {
  return {
    rootDir: m.rootDir,
    sense: m.sense,
    simulatedBest: m.simulatedBest,
    explore: m.explore,
    best: m.best,
    rankCycle: m.rankCycle,
    autoTick: m.autoTick,
    exportVault: m.exportVault,
    livingPerf: m.livingPerf,
    capture: m.capture,
    livingLore: m.livingLore,
    /**
     * review_sot bridge (separate project).
     * action: status|list|index|write_joy|write_view · REVIEW human only
     */
    livingRanking: function (opts) {
      return livingRankingOps.livingRanking(
        { tokenViewDispatch: m.tokenViewDispatch, loop: m.loop },
        opts || {}
      );
    },
    status: m.status,
    listModalities: m.listModalities,
    getDocs: m.getDocs,
    getModality: m.getModality,
    reload: m.reload,
    scaffoldProbe: m.scaffoldProbe,
    invoke: m.invoke,
    resolveExternal: m.resolveExternal,
    samplesRecent: m.samplesRecent,
    samplesStats: m.samplesStats,
    graduate: m.graduate,
    revoke: m.revoke,
    audit: m.audit,
    densifyDocs: m.densifyDocs,
    tokenView: m.tokenViewDispatch,
    livingSkill: m.livingSkill,
    saveLoopState: m.saveLoopState,
    loadLoopState: m.loadLoopState,
    archiveThrashPages: m.archiveThrashPages,
    purgeSampleNoise: function (o) {
      return samples.purgeNoise(m.rootDir, o || {});
    }
  };
}

module.exports = {
  buildPublicApi: buildPublicApi
};
