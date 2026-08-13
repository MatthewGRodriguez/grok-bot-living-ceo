/**
 * Smoke: multi-child rank → samples → graduation refuse/allow paths
 */
'use strict';

var path = require('path');
var fs = require('fs');
var assert = require('assert');
var { createRuntime } = require('../src/runtime');

var root = path.join(__dirname, '..');
var rt = createRuntime({ rootDir: root });

console.log('status', rt.status());

var sense = rt.sense('host');
assert(sense.hop0 && sense.hop0.lines && sense.hop0.lines[0], 'hop0 line0');
// P44: stable prefix (here · law · …) then dynamic (loop= may not be lines[2])
var hopText = sense.hop0.text || '';
assert(hopText.indexOf('loop=') >= 0, 'loop in hop0');
assert(hopText.indexOf('law=') >= 0, 'law in hop0');
// P56: SparDA-inspired forecast on hop0
assert(hopText.indexOf('forecast=') >= 0, 'P56 forecast= in hop0');
var lawIdx = hopText.indexOf('\nlaw=');
var loopIdx = hopText.indexOf('\nloop=');
var forecastIdx = hopText.indexOf('\nforecast=');
if (lawIdx < 0) lawIdx = hopText.indexOf('law=') === 0 ? 0 : -1;
// law should appear before loop (stable before dynamic)
assert(
  lawIdx >= 0 && loopIdx > lawIdx,
  'P44 law before loop (stable→dynamic): law@' + lawIdx + ' loop@' + loopIdx
);
// forecast is semi — before dynamic loop
assert(
  forecastIdx >= 0 && forecastIdx < loopIdx,
  'P56 forecast before loop (semi→dynamic): forecast@' + forecastIdx + ' loop@' + loopIdx
);
console.log('hop0:\n' + sense.hop0.text);

// P56/P58 handoff pack (NVIDIA KV-transfer process analog · parent-local)
var handoff = rt.tokenView({ action: 'handoff', format: 'toon' });
assert(handoff && handoff.ok, 'handoff ok');
assert(handoff.pack && handoff.pack.semi && handoff.pack.semi.forecast, 'handoff forecast');
assert(Array.isArray(handoff.pack.pages_jit) && handoff.pack.pages_jit.length, 'handoff pages_jit');
assert(handoff.pack.reenter && handoff.pack.reenter.length >= 1, 'handoff reenter checklist');
assert(handoff.fidelity && handoff.fidelity.handoff_tok_est != null, 'handoff fidelity');
assert(handoff.here === 'host' || (handoff.pack.stable && handoff.pack.stable.here === 'host'), 'handoff here host');
console.log(
  'handoff forecast',
  handoff.pack.semi.forecast,
  'pages_jit',
  handoff.pack.pages_jit.length,
  'fidelity',
  handoff.fidelity
);
// P58: parent-local sense + handoff (not host-only chrome)
var senseResearch = rt.sense('research');
assert(senseResearch && senseResearch.ok, 'sense research ok');
var hopR = (senseResearch.hop0 && senseResearch.hop0.text) || '';
assert(/open_next=/.test(hopR), 'research hop0 open_next');
assert(/forecast=/.test(hopR), 'research hop0 forecast');
var handoffR = rt.tokenView({ action: 'handoff', format: 'toon', modality: 'research' });
assert(handoffR && handoffR.ok, 'handoff research ok');
assert(
  handoffR.here === 'research' ||
    (handoffR.pack && handoffR.pack.stable && handoffR.pack.stable.here === 'research'),
  'handoff here=research'
);
assert(handoffR.pack && handoffR.pack.semi && handoffR.pack.semi.forecast, 'handoff research forecast');
var senseData = rt.sense('data');
assert(senseData && senseData.ok, 'sense data ok');
assert(/open_next=/.test((senseData.hop0 && senseData.hop0.text) || ''), 'data hop0 open_next');
console.log('P58 parent-local sense research/data + handoff research OK');

// P59 A1/A2/A5: loop persist · noise out of blend · denser skills
var samplesMod = require('../src/samples');
var skillsMod = require('../src/skills');
var loopStateMod = require('../src/loop_state');
assert(samplesMod.isNoiseSample({ kind: 'smoke', child: 'x' }), 'A2 smoke kind noise');
assert(
  samplesMod.isNoiseSample({ child: 'probe_cli_git_smoke_xyz' }),
  'A2 smoke child noise'
);
assert(
  !samplesMod.isNoiseSample({ kind: 'outcome', child: 'research' }),
  'A2 research not noise'
);
// blend path excludes noise (stats empty for pure-smoke child)
var stSmoke = samplesMod.stats(rt.rootDir, 'probe_cli_git_smoke_mskjne6w', {
  exclude_noise: true
});
// may be n=0 if no such id — still ok
assert(stSmoke && typeof stSmoke.n === 'number', 'A2 stats exclude_noise shape');
var skillList = skillsMod.dispatch(rt.rootDir, { action: 'list' });
assert(skillList && skillList.ok, 'A5 skill list ok');
assert(Array.isArray(skillList.dense), 'A5 skill list dense');
// force skill rewrite densest
var pkgW = skillsMod.writePackage(rt.rootDir, {
  child: 'research',
  did_prefix: 'wrote',
  n_help: 3,
  parent: 'host',
  last_did: 'wrote:research_latest.md'
});
assert(pkgW && pkgW.ok, 'A5 writePackage research');
var skGet = skillsMod.getPackage(rt.rootDir, 'research__wrote');
assert(skGet.ok && /re-enter/i.test(skGet.text), 'A5 package re-enter');
assert(/handoff/i.test(skGet.text), 'A5 package handoff tip');
// A1: Best persists loop_state
var bestOnce = rt.best('host');
assert(bestOnce && bestOnce.ok, 'A1 best ok');
var loaded = loopStateMod.load(rt.rootDir, {}, {});
assert(loaded && loaded.ok, 'A1 loop_state load ok');
assert(loaded.last_best, 'A1 last_best persisted');
console.log('P59 A1 loop persist last_best=', loaded.last_best, 'A5 skills dense n=', skillList.n);

var ids = rt.listModalities().map(function (m) { return m.id; }).sort();
console.log('modalities', ids);
['host', 'data', 'research', 'crystallize', 'craft'].forEach(function (id) {
  assert(ids.indexOf(id) >= 0, 'missing modality ' + id);
});

var sim = rt.simulatedBest('host');
assert(sim.ok && sim.ranked.length >= 4, 'simulatedBest multi-child');
console.log('SimulatedBest ranked', sim.ranked);

// explore still works
var ex = rt.explore('host');
assert(ex.ok && ex.externals.length > 0, 'explore found externals');
console.log('explore n=', ex.externals.length, 'summary=', ex.summary);

// dry_run invoke still peripheral
var dry = rt.invoke({ external_id: 'cli:git', args: ['--version'], dry_run: true });
assert(dry.ok && dry.dry_run, 'dry_run invoke');

// Best enters only top + records sample + parent-goal judge
var best1 = rt.best('host');
assert(best1.ok && best1.top, 'best has top');
assert(best1.sample, 'sample recorded');
assert(best1.entered && best1.entered.ok, 'top entered');
assert(best1.top.judge, 'judge present');
assert(typeof best1.top.judge.did_help === 'boolean', 'judge did_help');
console.log('Best1 top', best1.top.id, 'j', best1.top.j, 'judge', best1.top.judge);
console.log('sample', best1.sample);
console.log('graduation', best1.graduation && best1.graduation.note);

// craft should not auto-graduate without samples/help thresholds
var gCraft = rt.graduate('craft', false);
assert(gCraft.ok, 'graduate eval craft');
console.log('craft graduate', gCraft.note, gCraft.reasons);

// run a few cycles so research/crystallize can write pages and samples accumulate
for (var i = 0; i < 4; i++) {
  var c = rt.rankCycle('host');
  assert(c.ok, 'rankCycle ' + i);
  console.log(
    'cycle', i,
    'best', c.best.top && c.best.top.id,
    'j', c.best.top && c.best.top.j,
    'did', c.best.top && c.best.top.did,
    'can_grad', c.best.graduation && c.best.graduation.can_graduate
  );
}

var recent = rt.samplesRecent(20);
assert(recent.ok && recent.samples.length >= 3, 'samples accumulated');
console.log('samples_n', recent.samples.length);

// blend: stats exist for whoever won
var statsAll = rt.samplesStats();
assert(statsAll.ok && statsAll.by_modality.length >= 4, 'stats by modality');
console.log(
  'stats',
  statsAll.by_modality.filter(function (s) { return s.n > 0; })
);

// refuse path: apply graduate on craft while still probe with maybe few samples —
// if can_graduate false, apply must not flip status
var before = rt.getModality('craft').status;
var applied = rt.graduate('craft', true);
if (!applied.can_graduate) {
  assert(rt.getModality('craft').status === before, 'refuse must not change status');
  console.log('refuse path OK for craft:', applied.reasons);
} else {
  console.log('craft became eligible:', applied.target, 'applied=', applied.applied);
  // reload to confirm MANIFEST
  rt.reload();
  console.log('craft status after', rt.getModality('craft').status);
}

// densify host EXTERNALS (bloat collapse)
var dens = rt.densifyDocs({ modality: 'host' });
assert(dens.ok, 'densify ok');
console.log('densify', dens.bytes_saved, dens.results && dens.results[0] && dens.results[0].externals);

// audit lifecycle
var aud = rt.audit();
assert(aud.ok && aud.by_status, 'audit');
console.log('audit', aud.by_status, 'grad_elig', aud.graduate_eligible.length, 'revoke_elig', aud.revoke_eligible.length);

// host docs teach samples + graduate
var docs = rt.getDocs('host');
assert(docs.ok && docs.docs.HOW.indexOf('SimulatedBest') >= 0, 'host HOW SimulatedBest');
assert(docs.docs.HOW.indexOf('sample') >= 0 || docs.docs.HOW.indexOf('Outcome') >= 0, 'host HOW samples');
assert(docs.docs.HOW.indexOf('Graduation') >= 0 || docs.docs.HOW.indexOf('graduate') >= 0, 'host HOW graduate');

// pages written by research/crystallize/data/craft paths
var pagesDir = path.join(root, 'store', 'pages');
assert(fs.existsSync(pagesDir), 'pages dir');
var pages = fs.readdirSync(pagesDir);
console.log('pages', pages);
assert(
  pages.indexOf('effectiveness_samples.jsonl') >= 0 ||
    pages.some(function (p) { return p.indexOf('data_index') >= 0 || p.indexOf('research') >= 0; }),
  'durable pages exist'
);

// scaffold probe still works + cleans; revoke path for dead probes
// unique id so leftover samples.jsonl rows don't pollute eligibility
var probeId = 'probe_cli_git_smoke_' + Date.now().toString(36);
var sc = rt.scaffoldProbe({ external_id: 'cli:git', id: probeId, force: true });
assert(sc.ok, 'scaffold: ' + (sc.error || ''));
var simP = rt.simulatedBest('host');
var probeRank = simP.ranked.find(function (r) { return r.id === probeId; });
assert(probeRank, 'probe ranked');
var dataRank = simP.ranked.find(function (r) { return r.id === 'data'; });
assert(probeRank.j < 0.5, 'fresh probe low j');
console.log('probe vs data', probeRank, dataRank);

// revoke not eligible yet (no samples) — keep
var rev0 = rt.revoke(probeId, false);
assert(!rev0.can_revoke, 'fresh probe not revoked: ' + JSON.stringify(rev0.reasons || rev0));

// inject fake no-help samples to test revoke eligibility without farming Best
var samplesMod = require('../src/samples');
for (var k = 0; k < 4; k++) {
  samplesMod.record(root, {
    parent: 'host',
    child: probeId,
    goal: 'host:live',
    j: 0.2,
    did_help: false,
    did: 'verified:cli:git',
    status: 'probe',
    kind: 'smoke' // P40: smoke not hop0/prompt signal
  });
}
// P40 A2: prompt view excludes smoke rows
var cleanRecent = samplesMod.listRecent(root, 20, { for_prompt: true });
assert(
  cleanRecent.every(function (r) { return r.child !== probeId; }),
  'smoke samples filtered from for_prompt listRecent'
);
var rev1 = rt.revoke(probeId, true);
assert(rev1.can_revoke && rev1.applied, 'revoke applied for dead probe');
rt.reload();
assert(rt.getModality(probeId).status === 'revoked', 'status revoked');
var simR = rt.simulatedBest('host');
assert(!simR.ranked.find(function (r) { return r.id === probeId; }), 'revoked out of jgroup');
console.log('revoke path OK', rev1.reasons);

fs.rmSync(path.join(root, 'modalities', probeId), { recursive: true, force: true });
rt.reload();
assert(rt.listModalities().every(function (m) { return m.id !== probeId; }), 'probe cleaned');

// P42 skill packages JIT
var skList = rt.livingSkill({ action: 'list' });
assert(skList.ok, 'living_skill list');
// crystallize may have written packages after rank cycles
var skAfter = rt.rankCycle('host');
assert(skAfter.ok, 'rankCycle for skills');
var skList2 = rt.livingSkill({ action: 'list' });
console.log('skills packages n=', skList2.n, (skList2.ids || []).slice(0, 4).join(','));
if (skList2.ids && skList2.ids.length) {
  var skGet = rt.livingSkill({ action: 'get', id: skList2.ids[0] });
  assert(skGet.ok && skGet.text && skGet.text.indexOf('## when') >= 0, 'skill package body');
  console.log('skill get', skGet.id, 'tok~', skGet.tok_est);
}

// P43 judge anti-farm: same densest body twice → second not help
var judge = require('../src/judge');
var farmPage = path.join(root, 'store', 'pages', 'page_judge_farm_smoke.md');
var farmNonce = 'nonce_' + Date.now().toString(36);
var farmBody = [
  '# farm pad',
  '',
  '- law: densest structural body',
  '- open_goal: host:live',
  '- nonce: ' + farmNonce,
  '',
  '## densest',
  'Stable densest content for anti-farm fingerprint.',
  ''
].join('\n');
// clear prior fingerprint for this basename (leftover from previous smoke)
try {
  var fpPath = judge.writeFpPath(root);
  if (fs.existsSync(fpPath)) {
    var fpStore = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
    if (fpStore && fpStore.files) {
      delete fpStore.files['page_judge_farm_smoke.md'];
      fs.writeFileSync(fpPath, JSON.stringify(fpStore, null, 2) + '\n', 'utf8');
    }
  }
} catch (_fp) { /* */ }
fs.writeFileSync(farmPage, farmBody + '- at: 2026-01-01T00:00:00.000Z\n', 'utf8');
var j1 = judge.judgeEnter(root, {
  child: 'craft',
  parent: 'host',
  goal: 'host:live',
  self_helped: true,
  did: 'wrote:page_judge_farm_smoke.md'
});
assert(j1.did_help, 'first write helps: ' + JSON.stringify(j1.reasons));
// only change volatile at: line
fs.writeFileSync(farmPage, farmBody + '- at: 2026-12-31T23:59:59.000Z\n', 'utf8');
var j2 = judge.judgeEnter(root, {
  child: 'craft',
  parent: 'host',
  goal: 'host:live',
  self_helped: true,
  did: 'wrote:page_judge_farm_smoke.md'
});
assert(!j2.did_help, 'same body no help: ' + JSON.stringify(j2.reasons));
assert(
  (j2.reasons || []).some(function (r) {
    return String(r).indexOf('same_path_no_delta') >= 0;
  }),
  'reason includes same_path_no_delta'
);
console.log('anti-farm OK', j1.did_help, '→', j2.did_help, j2.reasons.filter(function (r) {
  return String(r).indexOf('delta') >= 0 || String(r).indexOf('struct') >= 0;
}));
// P60 A6 farm streak on third identical rewrite
var j3 = judge.judgeEnter(root, {
  child: 'craft',
  parent: 'host',
  goal: 'host:live',
  self_helped: true,
  did: 'wrote:page_judge_farm_smoke.md'
});
assert(!j3.did_help, 'farm streak still no help');
assert(
  j3.structural_delta && j3.structural_delta.farm_streak >= 1,
  'farm_streak tracked'
);
// P60 floors+ researchDebt API
var debtMod = require('../src/debt');
var rd = debtMod.researchDebt(root);
assert(rd && typeof rd.has === 'boolean', 'researchDebt shape');
var floors = debtMod.debtFloors(root, 'host');
assert(Array.isArray(floors), 'debtFloors array');
// P60 C1 hop0_signals
var hop0Sig = require('../src/hop0_signals');
assert(hop0Sig.hostMemSignal({}), 'hop0 mem');
assert(hop0Sig.densestLoopOk({ loop: {}, history: [], registry: { a: 1, b: 2, c: 3 }, rootDir: root }), 'hop0 loop_ok');
console.log('P60 A6 farm_streak', j3.structural_delta.farm_streak, 'researchDebt', rd.has, rd.reasons);
// P61 MCP core list (Anthropic progressive disclosure)
var mcpTools = require('../mcp/tools');
var meas = mcpTools.measureToolList();
assert(meas && meas.ok, 'P61 measureToolList');
assert(meas.mode_default === 'core', 'P61 default core');
assert(meas.core_tok_est < meas.dense_tok_est, 'P61 core ≪ dense');
var listedCore = mcpTools.listToolsForMcp();
assert(listedCore.length <= 12, 'P61 core list small n=' + listedCore.length);
assert(
  listedCore.some(function (t) {
    return t.name === 'living_sense';
  }),
  'P61 core has sense'
);
console.log(
  'P61 MCP list core n=',
  listedCore.length,
  'tok~',
  meas.core_tok_est,
  'vs full~',
  meas.full_tok_est
);
// P62 C1 extract + REVIEW densest + skill scripts
var sessionWrite = require('../src/session_write');
var skillsCryst = require('../src/skills_crystallize');
assert(sessionWrite.writeSessionTail && skillsCryst.crystallizeSkills, 'P62 modules');
var skScript = skillsMod.getScript(root, 'research__wrote');
assert(skScript && skScript.ok, 'P62 skill script research__wrote: ' + JSON.stringify(skScript));
var skGet2 = skillsMod.getPackage(root, 'research__wrote');
assert(skGet2.ok && skGet2.script && skGet2.script.exists, 'P62 package script flag');
var rankingReview = require('../src/ranking_review');
var pend = rankingReview.densestPending(null, { format: 'toon', cap: 8 });
assert(pend && pend.ok, 'P62 densestPending');
assert(pend.law && /intentional/i.test(pend.law), 'P62 pending law intentional');
assert(typeof pend.pending_n === 'number', 'P62 pending_n');
console.log(
  'P62 pending_n=',
  pend.pending_n,
  'shown=',
  pend.shown,
  'script tok~',
  skScript.tok_est
);
// P63 C1 related + living_perf + rank_cycle_mem
var relatedIndex = require('../src/related_index');
var livingPerfMod = require('../src/living_perf');
var rankCycleMem = require('../src/rank_cycle_mem');
var rel = relatedIndex.writeRelatedIndex(root);
assert(rel && rel.ok, 'P63 related_index');
var perf = livingPerfMod.livingPerf(root, {}, {});
assert(perf && perf.ok, 'P63 living_perf');
var mp = rankCycleMem.memPlan({});
assert(mp && typeof mp.memHigh === 'boolean', 'P63 memPlan');
console.log(
  'P63 related docs_n=',
  rel.docs_n,
  'backend=',
  rel.backend,
  'mem free_gb=',
  mp.free_gb
);
// P64 best_enter + token_view_dispatch
var bestEnter = require('../src/best_enter');
var tvDisp = require('../src/token_view_dispatch');
assert(bestEnter.enterAndSample && bestEnter.diversityPick, 'P64 best_enter');
assert(tvDisp.createTokenViewDispatch, 'P64 token_view_dispatch');
assert(bestEnter.isProbeId('probe_app_moho') && !bestEnter.isProbeId('research'), 'P64 probe id');
console.log('P64 best_enter + token_view_dispatch ok');
// P65 best_pick + rank_cycle_trim
var bestPick = require('../src/best_pick');
var rankCycleTrim = require('../src/rank_cycle_trim');
assert(bestPick.selectPick && bestPick.preferSecond, 'P65 best_pick');
assert(rankCycleTrim.softTrimSamples && rankCycleTrim.densifyHostDocs, 'P65 trim');
var sp = bestPick.selectPick(
  'host',
  [{ id: 'research' }, { id: 'data' }],
  { no_help_streak: 0 },
  [],
  false
);
assert(sp.pickId === 'research', 'P65 selectPick top');
console.log('P65 best_pick + rank_cycle_trim ok');
// P66 sense_core + explore_mod + parent_loop
var senseCore = require('../src/sense_core');
var exploreMod = require('../src/explore_mod');
var parentLoop = require('../src/parent_loop');
assert(senseCore.rankedChildren && senseCore.resolveForecast, 'P66 sense_core');
assert(exploreMod.explore, 'P66 explore_mod');
assert(parentLoop.setParentGoal && parentLoop.saveParentLoop, 'P66 parent_loop');
var kids = senseCore.rankedChildren(
  { a: { parent_id: 'host', last_j: 0.2, status: 'stable', id: 'a' }, host: { parent_id: null } },
  'host'
);
assert(kids.length === 1 && kids[0].id === 'a', 'P66 rankedChildren');
console.log('P66 sense_core + explore_mod + parent_loop ok');
// P67 capture · hop0_assemble · graduate_tail · lore · lifecycle · raw wiki
var captureMod = require('../src/capture');
var hop0Assemble = require('../src/hop0_assemble');
var graduateTail = require('../src/graduate_tail');
var ensureRaw = require('../src/ensure_raw_wiki');
var densLife = require('../src/densest_lifecycle');
var loreOps = require('../src/living_lore_ops');
assert(captureMod.capture && hop0Assemble.assembleHop0Opts, 'P67 capture/hop0');
assert(graduateTail.writeGraduateTail && ensureRaw.ensureRawWiki, 'P67 graduate/raw');
assert(densLife.densestLifecycle && loreOps.livingLore, 'P67 lifecycle/lore');
var hopOpts = hop0Assemble.assembleHop0Opts({
  modalityId: 'host',
  children: [],
  open_next: 'operate_close'
});
assert(hopOpts.here === 'host' && hopOpts.open_next === 'operate_close', 'P67 assemble');
console.log('P67 hop0_assemble + capture + graduate_tail ok');
// P68 densest_skills · invoke · best_nested
var dsh = require('../src/densest_skills_hop0');
var invD = require('../src/invoke_densest');
var bestNest = require('../src/best_nested');
assert(dsh.densestSkills && dsh.modalityPath, 'P68 densest_skills');
assert(invD.invoke && invD.writeInvokeTail, 'P68 invoke_densest');
assert(bestNest.runNestedData, 'P68 best_nested');
var pathSegs = dsh.modalityPath(
  { host: { parent_id: null }, research: { parent_id: 'host' } },
  'research'
);
assert(Array.isArray(pathSegs) && pathSegs[0] === 'host', 'P68 modalityPath array');
console.log('P68 densest_skills + invoke + nested ok');
// P69 status · graduate · autoTick · livingRanking
var runtimeStatus = require('../src/runtime_status');
var graduateOps = require('../src/graduate_ops');
var autoTickMod = require('../src/auto_tick');
var livingRankingOps = require('../src/living_ranking_ops');
assert(runtimeStatus.status && runtimeStatus.listModalities, 'P69 status');
assert(graduateOps.graduateEval && graduateOps.audit, 'P69 graduate');
assert(autoTickMod.autoTick && livingRankingOps.livingRanking, 'P69 auto/ranking');
console.log('P69 status + graduate + autoTick + livingRanking ok');
// P70 best_run · rank_cycle_finish · sense_run
var bestRun = require('../src/best_run');
var rankCycleFinish = require('../src/rank_cycle_finish');
var senseRun = require('../src/sense_run');
assert(typeof bestRun.runBest === 'function', 'P70 best_run.runBest');
assert(typeof rankCycleFinish.finishRankCycle === 'function', 'P70 finishRankCycle');
assert(typeof senseRun.runSense === 'function', 'P70 sense_run.runSense');
var p70Best = rt.best('host');
assert(p70Best && p70Best.ok && p70Best.top, 'P70 best via best_run');
var p70Sense = rt.sense('host');
assert(p70Sense && p70Sense.hop0 && p70Sense.hop0.text, 'P70 sense via sense_run');
var skillScr = require('../src/skills');
var crystScr = skillScr.getScript
  ? skillScr.getScript(root, 'crystallize__wrote')
  : null;
if (crystScr && crystScr.ok) {
  assert(crystScr.id === 'crystallize__wrote', 'P70 crystallize skill script');
  console.log('P70 skill script crystallize__wrote ok');
} else {
  console.log('P70 skill script optional skip', crystScr && crystScr.error);
}
console.log('P70 best_run + rank_cycle_finish + sense_run ok');
// P71 hop0_bind · simulated_best · rank_cycle_run
var hop0Bind = require('../src/hop0_bind');
var simBest = require('../src/simulated_best');
var rankCycleRun = require('../src/rank_cycle_run');
assert(typeof hop0Bind.bindHop0 === 'function', 'P71 hop0_bind');
assert(typeof simBest.runSimulatedBest === 'function', 'P71 simulated_best');
assert(typeof rankCycleRun.runRankCycle === 'function', 'P71 rank_cycle_run');
var h0b = hop0Bind.bindHop0({
  rootDir: root,
  getRegistry: function () {
    return { host: { parent_id: null, status: 'stable' } };
  },
  getLoop: function () {
    return { phase: 'sense' };
  },
  getHistory: function () {
    return [];
  }
});
assert(h0b.senseHelpers && h0b.densestOpenNext, 'P71 hop0 helpers bag');
var p71sim = rt.simulatedBest('host');
assert(p71sim && p71sim.ok && p71sim.simulated, 'P71 simulatedBest via module');
var p71rc = rt.rankCycle({ parent: 'host' });
assert(p71rc && p71rc.ok && p71rc.best, 'P71 rankCycle via rank_cycle_run');
var dataScr = skillScr.getScript
  ? skillScr.getScript(root, 'data__ensure_store')
  : null;
if (dataScr && dataScr.ok) {
  assert(dataScr.id === 'data__ensure_store', 'P71 data skill script');
  console.log('P71 skill script data__ensure_store ok');
}
console.log('P71 hop0_bind + simulated_best + rank_cycle_run ok');
// P72 runtime_api · runtime_writers · densest catalog
var runtimeApi = require('../src/runtime_api');
var runtimeWriters = require('../src/runtime_writers');
var densestPages = require('../src/densest_pages');
assert(typeof runtimeApi.buildPublicApi === 'function', 'P72 buildPublicApi');
assert(typeof runtimeWriters.bindWriters === 'function', 'P72 bindWriters');
assert(typeof densestPages.ensureCatalogIds === 'function', 'P72 ensureCatalogIds');
assert(
  densestPages.LINK_IDS.indexOf('research_improve_p72') >= 0 ||
    densestPages.LINK_IDS.indexOf('operate_handoff') >= 0,
  'P72 catalog extras present'
);
var p72api = runtimeApi.buildPublicApi({
  rootDir: root,
  loop: {},
  sense: function () {
    return { ok: true };
  },
  simulatedBest: function () {},
  explore: function () {},
  best: function () {},
  rankCycle: function () {},
  autoTick: function () {},
  exportVault: function () {},
  livingPerf: function () {},
  capture: function () {},
  livingLore: function () {},
  tokenViewDispatch: function () {},
  status: function () {},
  listModalities: function () {},
  getDocs: function () {},
  getModality: function () {},
  reload: function () {},
  scaffoldProbe: function () {},
  invoke: function () {},
  resolveExternal: function () {},
  samplesRecent: function () {},
  samplesStats: function () {},
  graduate: function () {},
  revoke: function () {},
  audit: function () {},
  densifyDocs: function () {},
  livingSkill: function () {},
  saveLoopState: function () {},
  loadLoopState: function () {},
  archiveThrashPages: function () {}
});
assert(p72api.sense && p72api.rankCycle && p72api.livingRanking, 'P72 api surface');
assert(typeof rt.sense === 'function' && typeof rt.rankCycle === 'function', 'P72 rt api');
var craftScr = skillScr.getScript
  ? skillScr.getScript(root, 'craft__wrote')
  : null;
if (craftScr && craftScr.ok) {
  assert(craftScr.id === 'craft__wrote', 'P72 craft skill script');
  console.log('P72 skill script craft__wrote ok');
}
console.log('P72 runtime_api + writers + catalog ok');
// P73 hop0 re-enter polish: slim history_tail + captures_tail SoT
var hop0Sig = require('../src/hop0_signals');
var slimSess = hop0Sig.densestSession(root, [
  { at: 't', parent: 'host', best: 'research', j: 0.2, help: true },
  { at: 't2', parent: 'host', best: 'data', j: 0.1, help: false }
]);
assert(Array.isArray(slimSess) && slimSess.length >= 1, 'P73 slim session rows');
assert(slimSess[slimSess.length - 1].child === 'data', 'P73 slim best→child');
assert(slimSess[slimSess.length - 1].help === false, 'P73 slim help');
var capProbe = rt.capture({
  kind: 'signal',
  text: 'P73 smoke capture persist'
});
assert(capProbe && capProbe.ok, 'P73 capture ok');
var loopStateMod = require('../src/loop_state');
var loaded = {};
var href = { history: [] };
var loadR = loopStateMod.load(root, loaded, href);
assert(loadR.ok, 'P73 loop_state load');
assert(
  loaded.last_capture &&
    String(loaded.last_capture.text).indexOf('P73') >= 0,
  'P73 last_capture persisted: ' + JSON.stringify(loaded.last_capture)
);
assert(
  Array.isArray(href.history) &&
    href.history.length > 0 &&
    href.history[0].best_top,
  'P73 history_tail rehydrated best_top'
);
var senseP73 = rt.sense('host');
var hopP73 = senseP73.hop0 && senseP73.hop0.text;
assert(hopP73 && hopP73.indexOf('session=') >= 0, 'P73 hop0 session line');
assert(hopP73.indexOf('session=—/N —/N —/N') < 0, 'P73 no empty session placeholders');
assert(hopP73.indexOf('last_capture=') >= 0, 'P73 last_capture line');
console.log('P73 hop0 session + capture re-enter ok');
// P74 perf stages persist · capture ISO
var p74rc = rt.rankCycle({ parent: 'host' });
assert(p74rc && p74rc.timing && p74rc.timing.sense_ms != null, 'P74 rankCycle stages');
try {
  rt.saveLoopState();
} catch (_s74) { /* */ }
var p74loop = {};
var p74href = { history: [] };
var p74load = loopStateMod.load(root, p74loop, p74href);
assert(p74load.ok, 'P74 loop load');
assert(
  p74loop.last_timing &&
    p74loop.last_timing.sense_ms != null &&
    p74loop.last_timing.explore_ms != null,
  'P74 last_timing stages persisted: ' + JSON.stringify(p74loop.last_timing)
);
var p74cap = rt.capture({ kind: 'signal', text: 'P74 smoke ISO capture' });
assert(p74cap && p74cap.ok, 'P74 capture');
var capTail = fs.readFileSync(
  path.join(root, 'store', 'pages', 'captures_tail.md'),
  'utf8'
);
assert(
  /20\d{2}-\d{2}-\d{2}T/.test(capTail),
  'P74 captures_tail has ISO timestamp'
);
var senseP74 = rt.sense('host');
var hopP74 = senseP74.hop0 && senseP74.hop0.text;
assert(hopP74 && hopP74.indexOf('perf=') >= 0, 'P74 hop0 perf');
assert(
  hopP74.indexOf('explore=?') < 0 ||
    (p74loop.last_timing && p74loop.last_timing.explore_ms == null),
  'P74 hop0 has explore stage when present'
);
// re-create runtime and check perf stages on hop0
var rtP74 = createRuntime({ rootDir: root });
var hopReload = rtP74.sense('host').hop0.text;
assert(
  hopReload.indexOf('explore=?') < 0,
  'P74 after reload perf not all ?: ' +
    (hopReload.split('\n').find(function (l) {
      return l.indexOf('perf=') === 0;
    }) || '')
);
console.log('P74 perf stages + capture ISO ok');
// P75 hop0 signal honesty
var senseCoreP75 = require('../src/sense_core');
var hostReg = require('../src/modality').loadRegistry(root);
var hostMod = hostReg.host;
var rTail = senseCoreP75.researchTail(hostMod);
assert(rTail, 'P75 researchTail present');
assert(
  String(rTail).indexOf('densified_at') < 0,
  'P75 researchTail not densified_at meta: ' + rTail
);
var senseP75b = rt.sense('host');
var hopP75 = senseP75b.hop0 && senseP75b.hop0.text;
assert(hopP75.indexOf('children_ranked=') >= 0, 'P75 children_ranked');
assert(
  hopP75.indexOf(':?:') < 0,
  'P75 no :?: null-j marker: ' +
    (hopP75.split('\n').find(function (l) {
      return l.indexOf('children_ranked=') === 0;
    }) || '')
);
// encode null j as —
var codecP75 = require('../src/codec');
var hopNull = codecP75.hop0({
  modalityId: 'host',
  children_ranked: [{ id: 'x', j: null, status: 'stable' }]
});
var tNull = hopNull.text || hopNull.lines && hopNull.lines.join('\n');
assert(tNull.indexOf('x:—:stable') >= 0, 'P75 codec null j as —');
console.log('P75 hop0 children + research_tail densest ok');
// P76 last_capture SoT · related densest · thrash timestamp pages
var dsh76 = require('../src/densest_skills_hop0');
var rel76 = dsh76.densestRelated(root);
assert(Array.isArray(rel76) && rel76.length >= 1, 'P76 densestRelated');
var relIds = rel76
  .map(function (h) {
    return String(h).split('~')[0];
  })
  .join(',');
assert(
  /operate_|research_/.test(relIds) || rel76.length > 0,
  'P76 related has densest edges: ' + relIds
);
var thrash76 = require('../src/thrash');
var thrDry = thrash76.archiveThrashPages(root, { apply: false, keep_ts: 2 });
assert(thrDry && thrDry.ok, 'P76 thrash dry ok');
// create temp surplus timestamp pages then archive
var pagesDir76 = path.join(root, 'store', 'pages');
var fakeTs = [
  'page_2020-01-01T00-00-00-000Z.md',
  'page_2020-01-02T00-00-00-000Z.md',
  'page_2020-01-03T00-00-00-000Z.md'
];
fakeTs.forEach(function (f) {
  fs.writeFileSync(path.join(pagesDir76, f), '# thrash smoke\n', 'utf8');
});
var thrApply = thrash76.archiveThrashPages(root, { apply: true, keep_ts: 2 });
assert(thrApply.n >= 1, 'P76 thrash archived surplus ts pages n=' + thrApply.n);
fakeTs.forEach(function (f) {
  try {
    fs.unlinkSync(path.join(pagesDir76, f));
  } catch (_e) { /* already archived */ }
});
var cap76 = rt.capture({ kind: 'signal', text: 'P76 smoke last_capture SoT' });
assert(cap76 && cap76.ok, 'P76 capture');
// stale loop should not win over captures_tail
rt.status().loop.last_capture = { kind: 'signal', text: 'STALE_SHOULD_NOT_WIN', at: 'x' };
var hop76 = rt.sense('host').hop0.text;
assert(
  hop76.indexOf('P76 smoke last_capture SoT') >= 0,
  'P76 hop0 last_capture from tail SoT: ' +
    (hop76.split('\n').find(function (l) {
      return l.indexOf('last_capture=') === 0;
    }) || '')
);
assert(hop76.indexOf('STALE_SHOULD_NOT_WIN') < 0, 'P76 stale loop ignored');
console.log('P76 last_capture SoT + related + thrash ok');
// JFactor Lab modality + ops densest
var jfl = require('../src/jfactor_lab_ops');
assert(jfl.status && jfl.dispatch, 'jfactor_lab_ops');
var jst = jfl.status({});
assert(jst.ok && jst.exists, 'jfactor lab root exists');
var jseed = jfl.dispatch({ action: 'seed' });
assert(jseed.ok && jseed.path, 'jfactor seed');
var jdry = jfl.dispatch({ action: 'harness', dry_run: true });
assert(jdry.ok && jdry.dry_run, 'jfactor harness dry_run');
var jmods = rt.listModalities().map(function (m) {
  return m.id || m;
});
assert(jmods.indexOf('jfactor_lab') >= 0, 'jfactor_lab modality registered');
console.log('jfactor_lab modality + ops densest ok');
// Exotelos structure densest
var exoMod = require('../src/exotelos');
var exoPack = exoMod.create({
  origin: 'smoke',
  primary: { interest: 'a', pole_a: '-', pole_b: '+' },
  secondary: { interest: 'b', pole_a: '-', pole_b: '+' },
  exotelos: {
    other_origin: 'other',
    intention: 'hope other develops independent densest law'
  }
});
assert(exoMod.validate(exoPack).ok, 'exotelos validate');
var exoTree = exoMod.expandAxes(exoPack, 3);
assert(exoTree.axis_tree && exoTree.axis_tree.children, 'exotelos expand');
var exoLine = exoMod.hop0Line(exoPack);
assert(exoLine.indexOf('exo=') === 0, 'exotelos hop0 line');
var regExo = require('../src/modality').loadRegistry(root);
assert(regExo.host && regExo.host.exotelos, 'host has exotelos');
assert(regExo.host.docs && regExo.host.docs.EXOTELOS, 'host EXOTELOS.md loaded');
assert(
  fs.existsSync(path.join(root, 'modalities', 'research', 'docs', 'EXOTELOS.md')),
  'research EXOTELOS.md'
);
var senseExo = rt.sense('host');
assert(
  senseExo.hop0 && senseExo.hop0.text && senseExo.hop0.text.indexOf('exo=') >= 0,
  'hop0 has exo='
);
console.log('exotelos structure densest ok');
// living_exotelos MCP + pantheon world
var exoOps = require('../src/exotelos_ops');
assert(exoOps.dispatch(root, { action: 'status' }).ok, 'exotelos status');
assert(exoOps.dispatch(root, { action: 'list' }).modalities.length >= 8, 'exotelos list');
var wlist = exoOps.dispatch(root, { action: 'world_list' });
assert(wlist.ok && wlist.n >= 5, 'exotelos world authored n=' + wlist.n);
var wb = exoOps.dispatch(root, { action: 'world_get', name: 'bonds' });
assert(wb.ok && wb.text && wb.text.indexOf('Present Covenant') >= 0, 'world bonds');
assert(
  mcpTools.TOOL_DEFS.some(function (t) {
    return t.name === 'living_exotelos';
  }),
  'living_exotelos tool'
);
console.log('living_exotelos + pantheon world ok');
var liveSig = exoMod.liveSignal(regExo.research.exotelos, {
  open_goal: 'densest research findings pages under host'
});
assert(liveSig && typeof liveSig.delta === 'number', 'liveSignal delta');
assert(liveSig.delta > -0.1 && liveSig.delta < 0.1, 'liveSignal soft bound');
var simScored = rt.simulatedBest('host');
assert(simScored && simScored.ranked && simScored.ranked.length, 'sim ranked');
var gradEx = require('../src/graduate');
var ge = gradEx.evaluate(root, regExo, 'joy_models', {});
assert(
  ge.checks &&
    ge.checks.some(function (c) {
      return c.id === 'docs_exotelos' && c.pass;
    }),
  'graduate checks docs_exotelos'
);
assert(
  ge.checks.some(function (c) {
    return c.id === 'exotelos_may_fade';
  }),
  'graduate may_fade check'
);
var scLive = require('../src/modality').scoreChildren(
  regExo,
  'host',
  require('../src/modality').createSharedJoys(),
  { rootDir: root, loop: { open_goal: 'densest research findings' } }
);
assert(scLive.exo_live && scLive.exo_live.research, 'scoreChildren exo_live');
assert(
  scLive.exo_live.research.delta !== 0 ||
    (scLive.exo_live.research.reasons || []).length,
  'exo_live reasons'
);
console.log('exotelos liveSignal + graduate exo checks ok');
assert(
  fs.existsSync(path.join(root, 'modalities', 'research', 'docs', 'BONDS.md')),
  'research BONDS.md'
);
var regBonds = require('../src/modality').loadRegistry(root);
assert(
  regBonds.research.bonds && regBonds.research.bonds.length >= 1,
  'research bonds loaded'
);
var bondSig = exoMod.liveBondSignal(regBonds.research.bonds, {
  open_goal: 'crystallize hop0 densest digest under bytes'
});
assert(typeof bondSig.delta === 'number', 'liveBondSignal');
var scBond = require('../src/modality').scoreChildren(
  regBonds,
  'host',
  require('../src/modality').createSharedJoys(),
  {
    rootDir: root,
    loop: { open_goal: 'host: crystallize densest hop0 digest' }
  }
);
assert(
  scBond.exo_live &&
    scBond.exo_live.research &&
    scBond.exo_live.research.bonds,
  'scoreChildren bonds in exo_live'
);
var senseB = rt.sense('research');
assert(
  senseB.hop0 &&
    senseB.hop0.text &&
    senseB.hop0.text.indexOf('bonds=') >= 0,
  'hop0 bonds= line'
);
var bl = exoOps.dispatch(root, { action: 'bonds' });
assert(bl.ok && bl.modalities && bl.modalities.length >= 8, 'exotelos bonds list');
var bg = exoOps.dispatch(root, {
  action: 'bonds_get',
  id: 'research',
  open_goal: 'crystallize hop0 digest'
});
assert(bg.ok && bg.bonds && bg.bonds.length >= 1 && bg.live, 'exotelos bonds_get');
var hint = exoMod.bondOpenHint(regBonds.research.bonds, {
  open_goal: 'crystallize hop0 densest digest'
});
assert(hint && hint.to === 'crystallize' && hint.hit, 'bondOpenHint crystallize hit');
var onBond = require('../src/open_next').densestOpenNext(root, regBonds, 'research', {
  open_goal: 'crystallize hop0 densest digest'
});
assert(String(onBond).indexOf('bond→') >= 0, 'open_next bond→ soft');
var fcBond = require('../src/forecast').densestForecast({
  open_next: onBond,
  bonds: regBonds.research.bonds,
  open_goal: 'crystallize hop0 densest digest',
  parent: 'research',
  here: 'research',
  skills: []
});
assert(String(fcBond).indexOf('bond→') >= 0 || String(fcBond).indexOf('crystallize') >= 0, 'forecast bond soft');
console.log('modality bonds densest ok');
try {
  fs.unlinkSync(farmPage);
} catch (_u) { /* */ }

// P45 REVIEW loads densest workbook money from disk
var rankingReview = require('../src/ranking_review');
var snapMoney = rankingReview.captureSnapshot(null, {});
assert(snapMoney.money, 'snapshot money object');
assert(
  snapMoney.money.net != null && isFinite(Number(snapMoney.money.net)),
  'P45 money.net from workbook_data: ' + JSON.stringify(snapMoney.money)
);
assert(
  snapMoney.money.surplus != null && isFinite(Number(snapMoney.money.surplus)),
  'P45 money.surplus present'
);
assert(snapMoney.money_source, 'money_source path set');
assert((snapMoney.expenses || []).length > 0, 'sheet expenses catalog n>0');
console.log(
  'REVIEW money',
  'net=' + snapMoney.money.net,
  'living=' + snapMoney.money.living,
  'debt=' + snapMoney.money.debtCash,
  'surplus=' + snapMoney.money.surplus,
  'exp_n=' + snapMoney.expenses_n,
  'src=' + require('path').basename(String(snapMoney.money_source))
);

// P48 binary boundary densest (source SoT · wasm/cold islands)
var binMod = require('../src/binary_boundary');
var bb = binMod.status(root);
assert(bb.ok && bb.replace_source === false, 'binary does not replace source');
assert(bb.hop0 && bb.hop0.indexOf('src=js') >= 0, 'hop0 binary tags src=js');
var senseBin = rt.sense('host');
var hopBin = senseBin.hop0 && senseBin.hop0.text;
assert(hopBin && hopBin.indexOf('binary=') >= 0, 'hop0 has binary= line');
console.log('binary boundary', bb.hop0, 'replace_source', bb.replace_source);

console.log('SMOKE OK');
