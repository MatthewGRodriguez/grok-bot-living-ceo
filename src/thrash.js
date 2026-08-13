/**
 * P47 C1 / P40 A3: archive page_z thrash pads to cold.
 * P76: also surplus craft timestamp pages page_YYYY-MM-DD… (keep last K).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cold = require('./cold');

function archiveOne(rootDir, pagesDir, f, opts, archived) {
  try {
    var full = path.join(pagesDir, f);
    var text = fs.readFileSync(full, 'utf8');
    var arch = cold.archiveText(rootDir, text, {
      name: f.replace(/\.md$/i, ''),
      kind: 'thrash_page'
    });
    if (arch.ok && opts.apply !== false) {
      fs.unlinkSync(full);
    }
    archived.push({
      file: f,
      cold: arch.meta && arch.meta.file,
      removed: opts.apply !== false
    });
  } catch (_e) { /* */ }
}

function archiveThrashPages(rootDir, opts) {
  opts = opts || {};
  var pagesDir = path.join(rootDir, 'store', 'pages');
  if (!fs.existsSync(pagesDir)) return { ok: true, n: 0, archived: [] };
  var files = fs.readdirSync(pagesDir);
  var thrash = files.filter(function (f) {
    return /^page_z_/i.test(f) || f === 'page_z_pilot_debt.md';
  });
  // P76: craft timestamp thrash — keep last keep_ts (default 2)
  var keepTs = opts.keep_ts != null ? opts.keep_ts : 2;
  var tsPages = files
    .filter(function (f) {
      return /^page_\d{4}-\d{2}-\d{2}T/i.test(f);
    })
    .sort();
  if (tsPages.length > keepTs) {
    thrash = thrash.concat(tsPages.slice(0, tsPages.length - keepTs));
  }
  // unique
  var seen = Object.create(null);
  thrash = thrash.filter(function (f) {
    if (seen[f]) return false;
    seen[f] = 1;
    return true;
  });
  if (!thrash.length) return { ok: true, n: 0, archived: [], note: 'none' };
  var archived = [];
  thrash.forEach(function (f) {
    archiveOne(rootDir, pagesDir, f, opts, archived);
  });
  return {
    ok: true,
    n: archived.length,
    archived: archived,
    hop0: archived.length ? 'thrash_cold:' + archived.length : '0'
  };
}

module.exports = {
  archiveThrashPages: archiveThrashPages
};
