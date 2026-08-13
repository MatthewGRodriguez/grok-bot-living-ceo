/**
 * P4/P20/P63 C1: related_index writer (extracted from runtime).
 * Hash-embed + token overlap densest — no forced rewrites from micro-score.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var accel = require('./accel');
var densestPages = require('./densest_pages');

var STOP = {
  the: 1,
  and: 1,
  for: 1,
  with: 1,
  that: 1,
  this: 1,
  from: 1,
  into: 1,
  when: 1,
  then: 1,
  than: 1,
  only: 1,
  under: 1,
  over: 1,
  last: 1,
  best: 1,
  densest: 1,
  law: 1,
  open: 1,
  none: 1,
  true: 1,
  false: 1,
  null: 1,
  host: 1,
  data: 1,
  page: 1,
  pages: 1,
  file: 1,
  files: 1,
  wrote: 1
};

function writeRelatedIndex(rootDir) {
  var pagesDir = path.join(rootDir, 'store', 'pages');
  if (!fs.existsSync(pagesDir)) {
    return { ok: false, error: 'no_pages' };
  }
  var densest = densestPages.RELATED_FILES
    ? densestPages.RELATED_FILES.slice()
    : [];
  // P63: ensure improve/skills research in related set when present
  // P75: keep recent operate/research densest in related set
  [
    'research_skills_vs_mcp.md',
    'research_improve_p61.md',
    'research_improve_p72.md',
    'research_improve_p73.md',
    'research_improve_p74.md',
    'research_improve_p75.md',
    'operate_handoff.md',
    'operate_review.md',
    'operate_runtime.md',
    'operate_close.md',
    'operate_skills.md'
  ].forEach(function (f) {
    if (densest.indexOf(f) < 0) densest.push(f);
  });
  var docs = [];
  densest.forEach(function (name) {
    var p = path.join(pagesDir, name);
    if (!fs.existsSync(p)) return;
    var text = '';
    try {
      text = fs.readFileSync(p, 'utf8');
    } catch (_e) {
      return;
    }
    var tokens = Object.create(null);
    String(text)
      .toLowerCase()
      .replace(/\[\[([^\]]+)\]\]/g, ' $1 ')
      .replace(/[^a-z0-9_]+/g, ' ')
      .split(/\s+/)
      .forEach(function (w) {
        if (!w || w.length < 4 || STOP[w]) return;
        if (/^\d+$/.test(w)) return;
        tokens[w] = (tokens[w] || 0) + 1;
      });
    docs.push({
      id: name.replace(/\.md$/i, ''),
      tokens: tokens,
      embed: accel.embedText(text, 48)
    });
  });
  var useDense =
    docs.length >= accel.THRESH.related_dense_pages && !accel.memCritical();
  var minScore = useDense ? 0.12 : 0.08;
  function scorePair(a, b) {
    if (useDense && a.embed && b.embed) {
      var cos = accel.cosine(a.embed, b.embed);
      var inter = 0;
      Object.keys(a.tokens).forEach(function (t) {
        if (b.tokens[t]) inter += 1;
      });
      var na = Object.keys(a.tokens).length;
      var nb = Object.keys(b.tokens).length;
      var jac = na && nb ? inter / (na + nb - inter) : 0;
      return 0.75 * cos + 0.25 * jac;
    }
    var inter2 = 0;
    Object.keys(a.tokens).forEach(function (t) {
      if (b.tokens[t]) inter2 += 1;
    });
    var na2 = Object.keys(a.tokens).length;
    var nb2 = Object.keys(b.tokens).length;
    if (!na2 || !nb2) return 0;
    return inter2 / (na2 + nb2 - inter2);
  }
  var edges = [];
  for (var i = 0; i < docs.length; i++) {
    var neigh = [];
    for (var j = 0; j < docs.length; j++) {
      if (i === j) continue;
      var sc = scorePair(docs[i], docs[j]);
      if (sc >= minScore) {
        neigh.push({ id: docs[j].id, s: sc });
      }
    }
    neigh.sort(function (x, y) {
      return y.s - x.s;
    });
    neigh = neigh.slice(0, 3);
    if (neigh.length) {
      edges.push({
        id: docs[i].id,
        related: neigh.map(function (n) {
          return n.id + '~' + n.s.toFixed(2);
        })
      });
    }
  }
  var lines = [
    '# related_index',
    '',
    useDense
      ? '- law: P20-hard dense related (char 3-gram hash-embed + token blend; ANE N/A in Node)'
      : '- law: P4 soft relatedness (token overlap ≥0.08; top 3)',
    '- backend: ' + (useDense ? 'hash_embed' : 'token_overlap'),
    '- docs_n: ' + docs.length,
    '',
    '## related'
  ];
  if (!edges.length) {
    lines.push('- _thin — need denser shared vocabulary_');
  } else {
    edges.forEach(function (e) {
      var bits = e.related.map(function (r) {
        var parts = r.split('~');
        var sc = Number(parts[1] || 0);
        var bucket = (Math.round(sc * 10) / 10).toFixed(1);
        return '[[' + parts[0] + ']]~' + bucket;
      });
      lines.push('- [[' + e.id + ']] → ' + bits.join(' '));
    });
  }
  lines.push(
    '',
    '[[link_index]] [[skills_index]] [[roadmap_densest]] [[reflect_law]]',
    ''
  );
  var core = lines.join('\n');
  var out = path.join(pagesDir, 'related_index.md');
  var prev = '';
  try {
    if (fs.existsSync(out)) prev = fs.readFileSync(out, 'utf8');
  } catch (_e2) { /* */ }
  var strip = function (t) {
    return String(t || '').replace(/- at:.*\n/g, '');
  };
  if (strip(prev).trim() === strip(core).trim()) {
    return {
      ok: true,
      wrote: false,
      docs_n: docs.length,
      edges_n: edges.length,
      backend: useDense ? 'hash_embed' : 'token_overlap'
    };
  }
  var body = core.replace(
    '# related_index\n\n',
    '# related_index\n\n- at: ' + new Date().toISOString() + '\n'
  );
  fs.writeFileSync(out, body, 'utf8');
  return {
    ok: true,
    wrote: true,
    backend: useDense ? 'hash_embed' : 'token_overlap',
    docs_n: docs.length,
    edges_n: edges.length,
    path: out
  };
}

module.exports = {
  writeRelatedIndex: writeRelatedIndex
};
