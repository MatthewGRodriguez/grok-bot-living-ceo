/**
 * crystallize — compress findings into hop0_digest.md + densify EXTERNALS when bloated
 */
'use strict';

var fs = require('fs');
var path = require('path');

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function tryDensifyHost(root) {
  try {
    var densify = require(path.join(root, 'src', 'densify'));
    var hostDir = path.join(root, 'modalities', 'host');
    var ext = path.join(hostDir, 'docs', 'EXTERNALS.md');
    if (fs.existsSync(ext) && fs.statSync(ext).size > 2500) {
      return densify.densifyExternals(hostDir, {});
    }
  } catch (_e) { /* */ }
  return null;
}

function readTail(p, maxChars) {
  try {
    if (!fs.existsSync(p)) return '';
    var t = fs.readFileSync(p, 'utf8');
    if (t.length <= maxChars) return t.trim();
    return t.slice(-maxChars).trim();
  } catch (_e) {
    return '';
  }
}

function effectiveness(state) {
  var root = rootFromLambda();
  var digest = path.join(root, 'store', 'pages', 'hop0_digest.md');
  var research = path.join(root, 'store', 'pages', 'research_latest.md');
  var hasDigest = fs.existsSync(digest);
  var hasResearch = fs.existsSync(research);
  var stale = true;
  var researchNewer = false;
  try {
    if (hasDigest) {
      var dm = fs.statSync(digest).mtimeMs;
      stale = Date.now() - dm > 10 * 60 * 1000;
      if (hasResearch && fs.statSync(research).mtimeMs > dm + 500) {
        researchNewer = true;
        stale = true;
      }
    }
  } catch (_e) {
    stale = true;
  }
  if (state.simulated) {
    // Prefer crystallize when research outran the digest (pipeline densify)
    if (researchNewer) return 0.72;
    if (!hasDigest && hasResearch) return 0.74;
    if (!hasDigest) return 0.58;
    if (stale) return 0.62;
    // Rest when digest is densest-current (mtime fresh AND research not newer)
    return 0.28;
  }
  if (state.helped) return 0.76;
  if (state.did === 'digest_unchanged') return 0.28;
  return hasDigest ? 0.45 : 0.52;
}

function work(state) {
  var root = rootFromLambda();
  var pages = path.join(root, 'store', 'pages');
  fs.mkdirSync(pages, { recursive: true });
  var digestPath = path.join(pages, 'hop0_digest.md');
  var researchTail = readTail(path.join(pages, 'research_latest.md'), 800);
  var hostResearch = readTail(
    path.join(root, 'modalities', 'host', 'docs', 'RESEARCH.md'),
    600
  );
  var loop = state.jgroup && state.jgroup.__livingLoop;
  // Hash research densest body (no volatile meta) so digest tracks research truth
  var researchCore = researchTail
    .replace(/- at:.*\n/g, '')
    .replace(/- last_best_before:.*\n/g, '')
    .replace(/- parent_j:.*\n/g, '')
    .slice(0, 600);
  var coreLines = [
    '# hop0_digest',
    '',
    '- open_goal: ' + ((loop && loop.open_goal) || 'host:live'),
    '',
    '## law',
    'sense → SimulatedBest → explore → Best → sample → graduate?',
    'j = blend(prior, recency-weighted samples); graduation can refuse high j.',
    'no-help explore #2; densify EXTERNALS under bytes.',
    '',
    '## research_core',
    researchCore || '_none yet_',
    '',
    '## links',
    '[[research_latest]] [[roadmap_densest]] [[link_index]] [[data_index]]',
    '',
    '## host_research_tail',
    hostResearch ? hostResearch.slice(0, 300) : '_thin_',
    ''
  ];
  var core = coreLines.join('\n');
  if (core.length > 2500) core = core.slice(0, 2500) + '\n…\n';
  try {
    function stripVolatile(t) {
      return String(t || '')
        .replace(/- at:.*\n/g, '')
        .replace(/- last_best:.*\n/g, '')
        .replace(/- parent_j:.*\n/g, '');
    }
    var prev = fs.existsSync(digestPath) ? fs.readFileSync(digestPath, 'utf8') : '';
    var dens = tryDensifyHost(root);
    var densSaved = dens && dens.ok && dens.saved ? dens.saved : 0;
    if (prev && stripVolatile(prev).trim() === stripVolatile(core).trim() && !densSaved) {
      state.helped = false;
      state.did = 'digest_unchanged';
      return;
    }
    var body = core.replace(
      '# hop0_digest\n\n',
      '# hop0_digest\n\n- at: ' + new Date().toISOString() + '\n'
    );
    fs.writeFileSync(digestPath, body, 'utf8');
    state.helped = true;
    state.did = 'wrote:hop0_digest.md';
    if (densSaved) state.did += '+densify_saved_' + densSaved;
  } catch (e) {
    state.helped = false;
    state.did = 'crystallize_error:' + e.message;
  }
}

module.exports = {
  effectiveness: effectiveness,
  work: work
};
