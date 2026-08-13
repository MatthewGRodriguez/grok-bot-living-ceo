/**
 * pages — densest store/pages surface under data.
 * P0: scan [[wiki-links]] → link_index.md (Obsidian-style graph without UI).
 */
'use strict';

var fs = require('fs');
var path = require('path');

var CRAFT_SOFT = 6;
var WIKI_RE = /\[\[([^\]]+)\]\]/g;

function rootFromLambda() {
  return path.join(__dirname, '..', '..', '..');
}

function pagesDir(root) {
  return path.join(root, 'store', 'pages');
}

function listPages(root) {
  var d = pagesDir(root);
  if (!fs.existsSync(d)) return [];
  try {
    return fs.readdirSync(d).filter(function (f) { return !f.startsWith('.'); });
  } catch (_e) {
    return [];
  }
}

function baseName(file) {
  return String(file || '').replace(/\.md$/i, '');
}

function scanWikiLinks(root) {
  var d = pagesDir(root);
  var files = listPages(root).filter(function (f) {
    return f.endsWith('.md') && f !== 'link_index.md';
  });
  // Only real page targets (avoid prose demos like [[wiki-links]])
  var exist = Object.create(null);
  files.forEach(function (f) {
    exist[baseName(f)] = true;
  });
  var forward = Object.create(null);
  var back = Object.create(null);
  files.forEach(function (file) {
    var src = baseName(file);
    forward[src] = forward[src] || [];
    var text = '';
    try {
      text = fs.readFileSync(path.join(d, file), 'utf8');
    } catch (_e) {
      return;
    }
    var m;
    WIKI_RE.lastIndex = 0;
    while ((m = WIKI_RE.exec(text)) !== null) {
      var target = String(m[1] || '').trim().split('|')[0].trim();
      if (!target || target === src) continue;
      if (!exist[target]) continue;
      if (forward[src].indexOf(target) < 0) forward[src].push(target);
      back[target] = back[target] || [];
      if (back[target].indexOf(src) < 0) back[target].push(src);
    }
  });
  return { forward: forward, back: back, nFiles: files.length };
}

function buildLinkIndexCore(scan) {
  var keys = Object.keys(scan.forward).sort();
  var lines = [
    '# link_index',
    '',
    '- law: [[wiki-links]] densest graph under data/pages (no Obsidian required)',
    '- pages_md: ' + scan.nFiles,
    '',
    '## forward'
  ];
  var edgeN = 0;
  keys.forEach(function (src) {
    var outs = (scan.forward[src] || []).slice().sort();
    if (!outs.length) return;
    edgeN += outs.length;
    lines.push('- [[' + src + ']] → ' + outs.map(function (t) { return '[[' + t + ']]'; }).join(' '));
  });
  lines.push('', '## backlinks');
  Object.keys(scan.back)
    .sort()
    .forEach(function (tgt) {
      var ins = (scan.back[tgt] || []).slice().sort();
      if (!ins.length) return;
      lines.push('- [[' + tgt + ']] ← ' + ins.map(function (s) { return '[[' + s + ']]'; }).join(' '));
    });
  lines.push('', '- edges: ' + edgeN, '');
  return lines.join('\n');
}

function effectiveness(state) {
  var root = rootFromLambda();
  var files = listPages(root);
  var hasIndex = files.indexOf('data_index.md') >= 0;
  var hasLinks = files.indexOf('link_index.md') >= 0;
  var craftN = files.filter(function (f) { return f.indexOf('page_') === 0; }).length;
  if (state.simulated) {
    if (!hasIndex) return 0.7;
    if (craftN > CRAFT_SOFT) return 0.65;
    if (!hasLinks) return 0.58; // P0: prefer building link graph once
    if (files.length < 3) return 0.55;
    return 0.35;
  }
  if (state.helped) return 0.72;
  if (state.did === 'pages_current') return 0.28;
  return 0.4;
}

function work(state) {
  var root = rootFromLambda();
  var d = pagesDir(root);
  fs.mkdirSync(d, { recursive: true });
  var files = listPages(root);
  var craft = files.filter(function (f) { return f.indexOf('page_') === 0; }).sort();
  var didParts = [];
  var helped = false;

  // Prune oldest craft pages over soft cap
  while (craft.length > CRAFT_SOFT) {
    var victim = craft.shift();
    try {
      fs.unlinkSync(path.join(d, victim));
      didParts.push('rm:' + victim);
      helped = true;
    } catch (_e) { /* */ }
  }

  // Densest index (stable core without thrashing timestamps)
  var indexPath = path.join(d, 'data_index.md');
  var files2 = listPages(root);
  var core = [
    '# data_index',
    '',
    '- pages: ' + files2.length,
    '- craft_pages: ' + files2.filter(function (f) { return f.indexOf('page_') === 0; }).length,
    '- densest: research_latest, hop0_digest, roadmap_densest, session_tail, skills_index, invoke_tail, related_index, link_index, data_index',
    '- law: densest first under data',
    ''
  ].join('\n');
  var prev = '';
  try {
    if (fs.existsSync(indexPath)) prev = fs.readFileSync(indexPath, 'utf8');
  } catch (_e2) { /* */ }
  var prevCore = prev.replace(/- at:.*\n/g, '');
  if (prevCore.trim() !== core.trim()) {
    var body = core.replace(
      '# data_index\n\n',
      '# data_index\n\n- at: ' + new Date().toISOString() + '\n'
    );
    fs.writeFileSync(indexPath, body, 'utf8');
    didParts.push('wrote:data_index.md');
    helped = true;
  }

  // P0 wiki-link graph (Obsidian lesson: graph travels with markdown)
  var scan = scanWikiLinks(root);
  var linkCore = buildLinkIndexCore(scan);
  var linkPath = path.join(d, 'link_index.md');
  var prevLink = '';
  try {
    if (fs.existsSync(linkPath)) prevLink = fs.readFileSync(linkPath, 'utf8');
  } catch (_e3) { /* */ }
  var prevLinkCore = prevLink.replace(/- at:.*\n/g, '');
  if (prevLinkCore.trim() !== linkCore.trim()) {
    var linkBody = linkCore.replace(
      '# link_index\n\n',
      '# link_index\n\n- at: ' + new Date().toISOString() + '\n'
    );
    fs.writeFileSync(linkPath, linkBody, 'utf8');
    didParts.push('wrote:link_index.md');
    helped = true;
  }

  state.helped = helped;
  state.did = helped ? didParts.join('+') : 'pages_current';
}

module.exports = {
  effectiveness: effectiveness,
  work: work,
  scanWikiLinks: scanWikiLinks
};
