/**
 * Densest compress — fight EXTERNALS/RESEARCH append bloat under bytes.
 */
'use strict';

var fs = require('fs');
var path = require('path');

/** Meta keys from densified headers — never treat as external ids. */
var META_ID = {
  densified_at: 1,
  explore_passes_collapsed: 1,
  last_explore: 1,
  unique_ids: 1,
  bytes_before: 1,
  candidates: 1,
  not: 1
};

/**
 * Real external id? kind:value form; reject densify meta thrash.
 */
function isExternalId(id) {
  if (!id || id.indexOf('…') === 0 || id === '…') return false;
  var bare = String(id).replace(/:$/, '');
  if (META_ID[bare] || META_ID[id]) return false;
  // require kind:value (app:X, cli:git, store:pages, os:darwin, …)
  if (id.indexOf(':') < 1) return false;
  var kind = id.split(':')[0].toLowerCase();
  if (META_ID[kind]) return false;
  return true;
}

/**
 * Compress a modality's EXTERNALS.md into densest unique ids + last explore stamp.
 * Write only when smaller (or force). Never re-parse densify meta as ids.
 */
function densifyExternals(modDir, opts) {
  opts = opts || {};
  var extPath = path.join(modDir, 'docs', 'EXTERNALS.md');
  if (!fs.existsSync(extPath)) {
    return { ok: false, error: 'no_externals', path: extPath };
  }
  var before = 0;
  var text = '';
  try {
    text = fs.readFileSync(extPath, 'utf8');
    before = Buffer.byteLength(text, 'utf8');
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }

  var ids = Object.create(null);
  var exploreCount = 0;
  var lastStamp = null;
  var alreadyDensified = /#\s*EXTERNALS\s*\(densified\)/i.test(text);

  text.split('\n').forEach(function (line) {
    var em = line.match(/^## explore\s+(\S+)/i);
    if (em) {
      exploreCount++;
      lastStamp = em[1];
      return;
    }
    // last_explore from densified header
    var le = line.match(/^-\s+last_explore:\s+(\S+)/);
    if (le && le[1] !== '—' && !lastStamp) lastStamp = le[1];
    var m = line.match(/^-\s+(\S+)(?:\s+\(([^)]+)\))?/);
    if (m && isExternalId(m[1])) {
      ids[m[1]] = true;
    }
  });

  // Already densified, no explore spam left, small file → skip thrash rewrite
  if (alreadyDensified && exploreCount === 0 && before < 900 && !opts.force) {
    // still repair if meta-as-id pollution present
    var polluted = /##\s+(densified_at|bytes_before|unique_ids|explore_passes)/i.test(text);
    if (!polluted) {
      return {
        ok: true,
        skipped: true,
        reason: 'already_densified',
        before: before,
        unique: Object.keys(ids).length
      };
    }
  }

  var unique = Object.keys(ids).sort();
  var byKind = {};
  unique.forEach(function (id) {
    var k = id.split(':')[0] || 'other';
    if (!byKind[k]) byKind[k] = [];
    byKind[k].push(id);
  });

  var maxPerKind = opts.maxPerKind != null ? opts.maxPerKind : 24;
  var lines = [
    '# EXTERNALS (densified)',
    '',
    'Densest unique surface — explore history collapsed. Candidates for probes; not auto-installed.',
    '',
    '- densified_at: ' + new Date().toISOString(),
    '- explore_passes_collapsed: ' + exploreCount,
    '- last_explore: ' + (lastStamp || '—'),
    '- unique_ids: ' + unique.length,
    '- bytes_before: ' + before,
    ''
  ];

  Object.keys(byKind).sort().forEach(function (k) {
    var list = byKind[k];
    lines.push('## ' + k + ' (' + list.length + ')');
    list.slice(0, maxPerKind).forEach(function (id) {
      lines.push('- ' + id);
    });
    if (list.length > maxPerKind) {
      lines.push('- … +' + (list.length - maxPerKind) + ' more');
    }
    lines.push('');
  });

  var out = lines.join('\n');
  var after = Buffer.byteLength(out, 'utf8');
  // never grow under densify unless force (write_only_needed)
  if (after > before && !opts.force) {
    return {
      ok: true,
      skipped: true,
      reason: 'would_grow',
      before: before,
      after: after,
      unique: unique.length,
      explore_passes_collapsed: exploreCount
    };
  }
  if (opts.dry_run) {
    return {
      ok: true,
      dry_run: true,
      before: before,
      after: after,
      unique: unique.length,
      explore_passes_collapsed: exploreCount
    };
  }
  fs.writeFileSync(extPath, out, 'utf8');
  return {
    ok: true,
    path: extPath,
    before: before,
    after: after,
    saved: before - after,
    unique: unique.length,
    explore_passes_collapsed: exploreCount,
    wrote: true
  };
}

/**
 * Keep RESEARCH.md densest: pin Boot/Open headers, collapse graduation spam.
 */
function densifyResearch(modDir, opts) {
  opts = opts || {};
  var p = path.join(modDir, 'docs', 'RESEARCH.md');
  if (!fs.existsSync(p)) return { ok: false, error: 'no_research' };
  var text = fs.readFileSync(p, 'utf8');
  var before = Buffer.byteLength(text, 'utf8');
  if (before < 2000 && !opts.force) {
    return { ok: true, skipped: true, reason: 'small_enough', before: before };
  }

  var graduations = [];
  text.split('\n').forEach(function (line) {
    var g = line.match(/status → \*\*(\w+)\*\*/);
    if (g) graduations.push(g[1]);
  });

  // Extract ## Open section lines if present
  var openLines = [];
  var inOpen = false;
  text.split('\n').forEach(function (line) {
    if (/^##\s+Open/i.test(line)) {
      inOpen = true;
      return;
    }
    if (/^##\s+/.test(line)) {
      inOpen = false;
      return;
    }
    if (inOpen && line.trim()) openLines.push(line);
  });

  var out = [
    '# RESEARCH (densified)',
    '',
    '## Boot',
    '- living-core modality package; densified to protect hop0 under bytes',
    '',
    '## Open'
  ].concat(openLines.length ? openLines : ['- (none captured)']).concat([
    '',
    '## graduation_tail',
    '- count: ' + graduations.length,
    '- last: ' + (graduations[graduations.length - 1] || '—'),
    '- densified_at: ' + new Date().toISOString(),
    ''
  ]).join('\n');

  var after = Buffer.byteLength(out, 'utf8');
  if (opts.dry_run) {
    return { ok: true, dry_run: true, before: before, after: after };
  }
  fs.writeFileSync(p, out, 'utf8');
  return { ok: true, path: p, before: before, after: after, saved: before - after };
}

/**
 * Densify docs for one or all modalities under root.
 */
function densifyAll(rootDir, opts) {
  opts = opts || {};
  var base = path.join(rootDir, 'modalities');
  var results = [];
  if (!fs.existsSync(base)) return { ok: false, error: 'no_modalities' };
  fs.readdirSync(base, { withFileTypes: true }).forEach(function (ent) {
    if (!ent.isDirectory()) return;
    if (opts.modality && ent.name !== opts.modality) return;
    var dir = path.join(base, ent.name);
    var ext = densifyExternals(dir, opts);
    var res = densifyResearch(dir, opts);
    results.push({ id: ent.name, externals: ext, research: res });
  });
  var saved = results.reduce(function (a, r) {
    return a + (r.externals && r.externals.saved ? r.externals.saved : 0) +
      (r.research && r.research.saved ? r.research.saved : 0);
  }, 0);
  return { ok: true, results: results, bytes_saved: saved };
}

module.exports = {
  densifyExternals: densifyExternals,
  densifyResearch: densifyResearch,
  densifyAll: densifyAll
};
