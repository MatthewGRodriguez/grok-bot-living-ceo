/**
 * P47 C1: densest page catalog (links · vault · related set).
 * Single SoT for hop0 links= + vault export names — avoid runtime thrash.
 */
'use strict';

var fs = require('fs');
var path = require('path');

/** hop0 links= candidates (basename without .md) */
var LINK_IDS = [
  'hop0_digest',
  'research_latest',
  'roadmap_densest',
  'operate_close',
  'operate_token_pilot',
  'operate_review',
  'operate_ranking_toon',
  'research_token_compression',
  'research_improve_living_core',
  'operate_signal_hygiene',
  'operate_invoke_toon',
  'operate_skills',
  'operate_judge',
  'operate_hop0',
  'operate_mcp',
  'operate_runtime',
  'operate_binary',
  'research_binary_boundary',
  'research_grok_build',
  'operate_grok_build',
  'operate_ics',
  'operate_mcp_resources',
  'research_mcp_peers',
  'operate_free_busy',
  'session_tail',
  'skills_index',
  'invoke_tail',
  'quality_law',
  'reflect_law',
  'wiki_law',
  'related_index',
  'perf_hardware'
];

/** vault copy set (.md filenames) */
var VAULT_FILES = [
  'research_latest.md',
  'hop0_digest.md',
  'roadmap_densest.md',
  'operate_close.md',
  'operate_token_pilot.md',
  'operate_review.md',
  'operate_ranking_toon.md',
  'research_token_compression.md',
  'research_improve_living_core.md',
  'operate_signal_hygiene.md',
  'operate_invoke_toon.md',
  'operate_skills.md',
  'operate_judge.md',
  'operate_hop0.md',
  'operate_mcp.md',
  'operate_runtime.md',
  'operate_binary.md',
  'research_binary_boundary.md',
  'research_grok_build.md',
  'operate_grok_build.md',
  'operate_ics.md',
  'operate_mcp_resources.md',
  'research_mcp_peers.md',
  'operate_free_busy.md',
  'session_tail.md',
  'skills_index.md',
  'invoke_tail.md',
  'related_index.md',
  'link_index.md',
  'data_index.md',
  'perf_hardware.md',
  'perf_loop_tail.md',
  'quality_law.md',
  'reflect_law.md',
  'graduate_tail.md',
  'wiki_law.md',
  'captures_tail.md'
];

/** related_index dense set (.md) — operate + research + law */
var RELATED_FILES = [
  'research_latest.md',
  'hop0_digest.md',
  'roadmap_densest.md',
  'research_improve_living_core.md',
  'research_token_compression.md',
  'operate_close.md',
  'operate_judge.md',
  'operate_skills.md',
  'operate_signal_hygiene.md',
  'operate_token_pilot.md',
  'operate_mcp.md',
  'operate_runtime.md',
  'operate_binary.md',
  'research_binary_boundary.md',
  'research_grok_build.md',
  'operate_grok_build.md',
  'session_tail.md',
  'skills_index.md',
  'link_index.md',
  'data_index.md',
  'related_index.md',
  'quality_law.md',
  'reflect_law.md',
  'perf_hardware.md',
  'perf_loop_tail.md'
];

function densestLinks(rootDir, opts) {
  opts = opts || {};
  var cap = opts.cap != null ? opts.cap : 6;
  var pagesDir = path.join(rootDir, 'store', 'pages');
  return LINK_IDS.filter(function (n) {
    try {
      return fs.existsSync(path.join(pagesDir, n + '.md'));
    } catch (_e) {
      return false;
    }
  })
    .slice(0, cap)
    .map(function (n) {
      return { id: n };
    });
}

function exportVault(rootDir, opts) {
  opts = opts || {};
  var vaultDir = path.join(rootDir, 'store', 'vault');
  var pagesDir = path.join(rootDir, 'store', 'pages');
  fs.mkdirSync(vaultDir, { recursive: true });
  var copied = [];
  VAULT_FILES.forEach(function (name) {
    var src = path.join(pagesDir, name);
    if (!fs.existsSync(src)) return;
    try {
      fs.copyFileSync(src, path.join(vaultDir, name));
      copied.push(name);
    } catch (_e) { /* */ }
  });
  try {
    var hostRes = path.join(rootDir, 'modalities', 'host', 'docs', 'RESEARCH.md');
    if (fs.existsSync(hostRes)) {
      fs.copyFileSync(hostRes, path.join(vaultDir, 'host_RESEARCH.md'));
      copied.push('host_RESEARCH.md');
    }
  } catch (_h) { /* */ }

  var home = [
    '# living-core vault',
    '',
    '- law: P5 Obsidian-compatible view of densest store/pages (not a second brain product)',
    '- at: ' + new Date().toISOString(),
    '- files: ' + copied.length,
    '',
    '## open in Obsidian',
    '1. Open folder as vault: `store/vault` under living-core',
    '2. Graph view uses `[[wiki-links]]` already in notes',
    '3. Re-export after pilot ticks: `living_vault_export` / `exportVault()`',
    '',
    '## densest map',
    '- [[hop0_digest]] — attention hop0 law',
    '- [[research_latest]] — outcome densest note',
    '- [[roadmap_densest]] — ordered roadmap (P0–P47)',
    '- [[operate_close]] — steady operate · rankCycle · sheet SoT',
    '- [[operate_token_pilot]] — TOON / token / cold pilot operate',
    '- [[operate_review]] — REVIEW gate densest + sheet money',
    '- [[operate_ranking_toon]] — edges/actions/joys TOON pack',
    '- [[research_token_compression]] — TOON · zstd · layered hide research',
    '- [[research_improve_living_core]] — densest improve map',
    '- [[operate_signal_hygiene]] — smoke filter · loop persist · thrash cold',
    '- [[operate_invoke_toon]] — invoke log TOON pack (L3)',
    '- [[operate_skills]] — skill packages JIT',
    '- [[operate_judge]] — anti-farm structural delta',
    '- [[operate_hop0]] — KV order stable→dynamic',
    '- [[operate_mcp]] — progressive tools dense list',
    '- [[operate_runtime]] — runtime split densest (P47)',
    '- [[operate_binary]] — binary boundary · wasm/cold islands (P48)',
    '- [[research_binary_boundary]] — assembly/binary vs source densest',
    '- [[research_grok_build]] — Grok Build native · update · no reinvent',
    '- [[operate_grok_build]] — harness operate densest (P50)',
    '- [[operate_ics]] — ICS schedule export densest (P51)',
    '- [[operate_mcp_resources]] — MCP resources+prompts densest (P54)',
    '- [[research_mcp_peers]] — peer MCP map · three primitives',
    '- [[operate_free_busy]] — free/busy densest Reclaim-lite (P55)',
    '- [[session_tail]] — last-K Best outcomes',
    '- [[skills_index]] — repeated help procedures',
    '- [[invoke_tail]] — intentional Mac invokes (not rank)',
    '- [[related_index]] — soft token neighbors',
    '- [[link_index]] — wiki forward/backlinks',
    '- [[data_index]] — store index',
    '- [[quality_law]] — speed≠everything · write_only_needed · loop preflight',
    '- [[reflect_law]] — smarter≠faster · clearer≠optimal · reify/reflect',
    '- [[wiki_law]] — raw immutable · pages wiki densest',
    '- [[perf_hardware]] — host hw + accel densest research',
    '- [[perf_loop_tail]] — rankCycle stage timings',
    '',
    '## non-goals',
    '- Does not auto-open Obsidian (use living_invoke intentionally)',
    '- Does not copy effectiveness_samples.jsonl (bytes)',
    '- Grok remains outer author',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(vaultDir, 'Home.md'), home, 'utf8');
  if (copied.indexOf('Home.md') < 0) copied.push('Home.md');

  try {
    var ob = path.join(vaultDir, '.obsidian');
    fs.mkdirSync(ob, { recursive: true });
    var appJson = path.join(ob, 'app.json');
    if (!fs.existsSync(appJson)) {
      fs.writeFileSync(
        appJson,
        JSON.stringify({ alwaysUpdateLinks: true }, null, 2) + '\n',
        'utf8'
      );
    }
  } catch (_o) { /* */ }

  return {
    ok: true,
    path: vaultDir,
    files: copied,
    n: copied.length,
    note: 'Open store/vault as Obsidian vault; re-export after ticks'
  };
}

/**
 * P72: extend densest catalogs in place (ids without .md).
 * Idempotent — safe when densest_pages is root-owned or reloaded.
 */
function ensureCatalogIds(ids) {
  ids = ids || [];
  var added = 0;
  ids.forEach(function (id) {
    if (!id) return;
    var base = String(id).replace(/\.md$/i, '');
    if (LINK_IDS.indexOf(base) < 0) {
      LINK_IDS.push(base);
      added++;
    }
    var md = base + '.md';
    if (VAULT_FILES.indexOf(md) < 0) VAULT_FILES.push(md);
    if (RELATED_FILES.indexOf(md) < 0) RELATED_FILES.push(md);
  });
  return { ok: true, added: added, link_n: LINK_IDS.length };
}

// P56–P72 densest research / operate extras (in-place, not a second catalog farm)
ensureCatalogIds([
  'research_nvidia_kv_handoff',
  'operate_handoff',
  'research_skills_vs_mcp',
  'research_improve_p56',
  'research_improve_p70',
  'research_improve_p71',
  'research_improve_p72',
  'research_improve_p73',
  'research_improve_p74',
  'research_improve_p75',
  'research_improve_p76',
  'research_living_grok',
  'research_jfactor_lab',
  'exotelos_law',
  'research_exotelos'
]);

module.exports = {
  LINK_IDS: LINK_IDS,
  VAULT_FILES: VAULT_FILES,
  RELATED_FILES: RELATED_FILES,
  densestLinks: densestLinks,
  exportVault: exportVault,
  ensureCatalogIds: ensureCatalogIds
};
