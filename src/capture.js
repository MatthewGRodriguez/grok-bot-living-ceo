/**
 * P28/P67 C1: densest capture (extracted from runtime).
 */
'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Append one densest capture line; mutate loop.last_capture.
 */
function capture(rootDir, loop, opts) {
  opts = opts || {};
  loop = loop || {};
  var text = String(opts.text || opts.note || '').trim();
  if (!text) return { ok: false, error: 'text required' };
  if (text.length > 500) text = text.slice(0, 500);
  var kind = String(opts.kind || 'capture').slice(0, 16);
  var at = new Date().toISOString();
  var row = { at: at, kind: kind, text: text };
  if (!loop.captures) loop.captures = [];
  loop.captures.push(row);
  if (loop.captures.length > 40) loop.captures = loop.captures.slice(-30);
  loop.last_capture = {
    kind: kind,
    text: text.slice(0, 80),
    at: at
  };

  var p = path.join(rootDir, 'store', 'pages', 'captures_tail.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  var prevRows = [];
  try {
    if (fs.existsSync(p)) {
      fs.readFileSync(p, 'utf8')
        .split('\n')
        .forEach(function (line) {
          // ISO or legacy HH:MM:SS · kind · text
          var m = line.match(/^\s*-\s+(\S+)\s+(\S+)\s+(.+)$/);
          if (m && m[2] !== 'law:' && m[1] !== 'law:') {
            prevRows.push({ at: m[1], kind: m[2], text: m[3] });
          }
        });
    }
  } catch (_e) { /* */ }
  prevRows.push({
    // P74: full ISO densest (not HH:MM:SS only — re-enter + sort)
    at: at,
    kind: kind,
    text: text
  });
  prevRows = prevRows.slice(-16);
  var lines = [
    '# captures_tail',
    '',
    '- law: P28 densest capture — friction < remember; no org required',
    '- n: ' + prevRows.length,
    '',
    '## captures'
  ];
  prevRows.forEach(function (r) {
    lines.push('- ' + r.at + ' ' + r.kind + ' ' + r.text);
  });
  lines.push(
    '',
    '[[session_tail]] [[skills_index]] [[roadmap_densest]] [[wiki_law]]',
    ''
  );
  fs.writeFileSync(p, lines.join('\n'), 'utf8');
  return {
    ok: true,
    capture: row,
    n: prevRows.length,
    path: p,
    note: 'densest capture; hop0 last_capture= re-enter'
  };
}

module.exports = {
  capture: capture
};
