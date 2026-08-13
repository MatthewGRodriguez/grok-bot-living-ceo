/**
 * P25/P67 C1: ensure store/raw + wiki_law densest (extracted).
 */
'use strict';

var fs = require('fs');
var path = require('path');

function ensureRawWiki(rootDir, opts) {
  opts = opts || {};
  var rawDir = path.join(rootDir, 'store', 'raw');
  var pagesDir = path.join(rootDir, 'store', 'pages');
  var wrote = [];
  try {
    fs.mkdirSync(rawDir, { recursive: true });
    fs.mkdirSync(pagesDir, { recursive: true });
    var readme = path.join(rawDir, 'README.md');
    var body = [
      '# store/raw',
      '',
      '- law: P25 Karpathy-style raw layer — **immutable sources**',
      '- do: drop original PDFs/HTML/exports here once; do not edit in place',
      '- query: LLM/Grok works from `store/pages` wiki densest, not re-reading raw every turn',
      '- never: auto-delete raw; never thrash-rewrite raw from rank Best',
      '',
      '## map',
      '- raw/ = source of truth (bytes-heavy ok if rare)',
      '- pages/ = densest wiki ([[wiki-links]], hop0 re-enter)',
      '- vault/ = Obsidian view of densest pages only',
      '',
      '[[wiki_law]] [[data_index]] [[roadmap_densest]]',
      ''
    ].join('\n');
    var prev = '';
    try {
      if (fs.existsSync(readme)) prev = fs.readFileSync(readme, 'utf8');
    } catch (_r) { /* */ }
    if (prev.trim() !== body.trim()) {
      fs.writeFileSync(readme, body, 'utf8');
      wrote.push('raw/README.md');
    }
    var wikiLaw = path.join(pagesDir, 'wiki_law.md');
    var wikiBody = [
      '# wiki_law',
      '',
      '- at: ' + new Date().toISOString().slice(0, 10),
      '- law: **query densest wiki, not raw thrash** (Karpathy wiki layer densest)',
      '- roadmap: P25',
      '',
      '## Split',
      '| Layer | Path | Rule |',
      '|-------|------|------|',
      '| **raw** | `store/raw/` | immutable sources; drop once; no rank rewrite |',
      '| **wiki** | `store/pages/` | densest markdown + [[links]]; hop0 re-enter |',
      '| **vault** | `store/vault/` | Obsidian export of densest wiki only |',
      '',
      '## Why',
      '- Re-reading raw every session burns tokens (X/Karpathy wiki threads)',
      '- living-core already densest-first; this makes raw vs wiki **explicit**',
      '',
      '## Rules',
      '1. Grok outer author may place originals under raw/',
      '2. Best/modalities write densest pages/exports — not mutate raw/',
      '3. Under free_gb critical: densify wiki; never farm raw copies',
      '',
      '## Links',
      '- [[quality_law]] · [[reflect_law]] · [[roadmap_densest]] · [[data_index]]',
      ''
    ].join('\n');
    var wp = '';
    try {
      if (fs.existsSync(wikiLaw)) wp = fs.readFileSync(wikiLaw, 'utf8');
    } catch (_w) { /* */ }
    var stripAt = function (t) {
      return String(t || '').replace(/- at:.*\n/g, '');
    };
    if (stripAt(wp).trim() !== stripAt(wikiBody).trim()) {
      fs.writeFileSync(wikiLaw, wikiBody, 'utf8');
      wrote.push('pages/wiki_law.md');
    }
  } catch (_e) {
    return { ok: false, error: String(_e && _e.message || _e) };
  }
  var rawN = 0;
  try {
    rawN = fs
      .readdirSync(rawDir)
      .filter(function (f) {
        return f !== 'README.md' && !f.startsWith('.');
      }).length;
  } catch (_n) { /* */ }
  return { ok: true, wrote: wrote, raw_n: rawN, path: rawDir };
}

module.exports = {
  ensureRawWiki: ensureRawWiki
};
