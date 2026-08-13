/**
 * P24/P67 C1: graduate_tail densest page writer (extracted).
 */
'use strict';

var fs = require('fs');
var path = require('path');

function writeGraduateTail(rootDir, evals) {
  var list = (evals || []).filter(function (e) {
    return e && e.id && (e.refused || e.can_graduate || e.applied);
  });
  var lines = [
    '# graduate_tail',
    '',
    '- law: P24 densest graduation outcomes (refuse/eligible/apply)',
    '- n: ' + list.length,
    '',
    '## outcomes'
  ];
  if (!list.length) {
    lines.push('- _none this evaluate_');
  } else {
    list.slice(0, 12).forEach(function (e) {
      var flag = e.applied
        ? 'APPLIED'
        : e.can_graduate
          ? 'CAN'
          : e.refused
            ? 'REFUSE'
            : '?';
      var why = (e.reasons || []).slice(0, 3).join(',');
      lines.push(
        '- ' +
          (e.id || '?') +
          ' ' +
          (e.status || '?') +
          '→' +
          (e.target || '?') +
          ' ' +
          flag +
          (why ? ' · ' + why : '')
      );
    });
  }
  lines.push('', '[[roadmap_densest]] [[lifecycle]] [[hop0_digest]]', '');
  var core = lines.join('\n');
  var p = path.join(rootDir, 'store', 'pages', 'graduate_tail.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  var prev = '';
  try {
    if (fs.existsSync(p)) prev = fs.readFileSync(p, 'utf8');
  } catch (_e) { /* */ }
  var strip = function (t) {
    return String(t || '').replace(/- at:.*\n/g, '');
  };
  if (strip(prev).trim() === strip(core).trim()) {
    return { ok: true, wrote: false, n: list.length };
  }
  var body = core.replace(
    '# graduate_tail\n\n',
    '# graduate_tail\n\n- at: ' + new Date().toISOString() + '\n'
  );
  fs.writeFileSync(p, body, 'utf8');
  try {
    var hostRes = path.join(rootDir, 'modalities', 'host', 'docs', 'RESEARCH.md');
    if (fs.existsSync(hostRes)) {
      var rt = fs.readFileSync(hostRes, 'utf8');
      var last = list.length
        ? list[list.length - 1].id +
          ':' +
          (list[list.length - 1].can_graduate
            ? 'CAN'
            : list[list.length - 1].refused
              ? 'REFUSE'
              : '?')
        : '—';
      rt = rt
        .replace(/- count: .*/, '- count: ' + list.length)
        .replace(/- last: .*/, '- last: ' + last);
      fs.writeFileSync(hostRes, rt, 'utf8');
    }
  } catch (_h) { /* */ }
  return { ok: true, wrote: true, n: list.length, path: p };
}

module.exports = {
  writeGraduateTail: writeGraduateTail
};
