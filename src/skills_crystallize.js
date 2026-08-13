/**
 * P62 C1: skill crystallize from samples (extracted from runtime).
 * Does NOT auto-scaffold modalities — Grok outer author.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var samples = require('./samples');
var skillsMod = require('./skills');

function didPrefix(did) {
  var s = String(did || '—');
  var head = s.split('+')[0].trim();
  if (head.indexOf(':') > 0) {
    head = head.split(':')[0];
  }
  return head.slice(0, 32) || '—';
}

/**
 * Crystallize densest skills for parent; updates loop.last_skills when loop provided.
 * @returns {{ ok, wrote, skills_n, skills, packages, path? }}
 */
function crystallizeSkills(rootDir, parentId, loop) {
  parentId = parentId || 'host';
  loop = loop || {};
  var HELP_MIN = 3;
  var all = samples.readAll(rootDir);
  var counts = Object.create(null);
  all.slice(-80).forEach(function (row) {
    if (!row || !row.did_help) return;
    if (samples.isNoiseSample && samples.isNoiseSample(row)) return;
    if (row.parent && row.parent !== parentId && parentId === 'host') {
      if (row.parent !== 'host') return;
    }
    if (parentId !== 'host' && row.parent !== parentId) return;
    var child = row.child || '?';
    var pref = didPrefix(row.did);
    var key = child + '|' + pref;
    if (!counts[key]) {
      counts[key] = {
        child: child,
        did_prefix: pref,
        n_help: 0,
        last_did: row.did || pref,
        last_j: row.j,
        last_at: row.at
      };
    }
    counts[key].n_help += 1;
    counts[key].last_did = row.did || pref;
    if (row.j != null) counts[key].last_j = row.j;
    counts[key].last_at = row.at;
  });
  var skills = Object.keys(counts)
    .map(function (k) {
      return counts[k];
    })
    .filter(function (s) {
      return s.n_help >= HELP_MIN;
    })
    .sort(function (a, b) {
      return b.n_help - a.n_help;
    })
    .slice(0, 8);

  var pkg = { ids: [], written: [] };
  try {
    pkg = skillsMod.writePackages(
      rootDir,
      skills.map(function (s) {
        return {
          child: s.child,
          did_prefix: s.did_prefix,
          n_help: s.n_help,
          last_did: s.last_did,
          last_j: s.last_j,
          parent: parentId
        };
      }),
      { parent: parentId }
    );
  } catch (_pk) {
    pkg = { ids: [], written: [], error: String(_pk && _pk.message) };
  }

  loop.last_skills = skills.map(function (s) {
    return {
      child: s.child,
      did_prefix: s.did_prefix,
      n_help: s.n_help,
      id: skillsMod.skillId(s.child, s.did_prefix)
    };
  });

  var lines = [
    '# skills_index',
    '',
    '- law: P1/P42/P59/P62 crystallize · index=catalog · packages=JIT · parent-local · optional scripts',
    '- parent: ' + parentId,
    '- skills_n: ' + skills.length,
    '- packages: ' + (pkg.ids && pkg.ids.length ? pkg.ids.join(' ') : '—'),
    '- load: living_skill action=get id=<package>',
    '- handoff: living_token_view action=handoff modality=' + parentId,
    '',
    '## procedures'
  ];
  if (!skills.length) {
    lines.push('- _none yet — need ≥' + HELP_MIN + ' helps per (child, did_prefix)_');
  } else {
    skills.forEach(function (s) {
      var jBucket =
        s.last_j != null
          ? (Math.round(Number(s.last_j) * 5) / 5).toFixed(1)
          : '—';
      var helpBucket =
        s.n_help < 10
          ? s.n_help
          : s.n_help < 30
            ? Math.floor(s.n_help / 5) * 5
            : Math.floor(s.n_help / 10) * 10;
      var didStable = didPrefix(s.last_did);
      var sid = skillsMod.skillId(s.child, s.did_prefix);
      var hasScript = skillsMod.hasScript && skillsMod.hasScript(rootDir, sid);
      lines.push(
        '- **' +
          s.child +
          '** / `' +
          s.did_prefix +
          '` · help×~' +
          helpBucket +
          ' · j~' +
          jBucket +
          ' · id=`' +
          sid +
          '`' +
          (hasScript ? ' · script' : '')
      );
      lines.push('  - when: parent goal needs densest ' + s.child + ' work');
      lines.push('  - do: Best enters ' + s.child + ' → ' + didStable);
      lines.push(
        '  - package: [[skills/' + sid + ']] · `living_skill get ' + sid + '`'
      );
    });
  }
  lines.push(
    '',
    '[[session_tail]] [[roadmap_densest]] [[research_latest]] [[hop0_digest]] [[operate_skills]]',
    ''
  );
  var core = lines.join('\n');
  var p = path.join(rootDir, 'store', 'pages', 'skills_index.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  var prev = '';
  try {
    if (fs.existsSync(p)) prev = fs.readFileSync(p, 'utf8');
  } catch (_e) { /* */ }
  var strip = function (t) {
    return String(t || '').replace(/- at:.*\n/g, '');
  };
  if (strip(prev).trim() === strip(core).trim()) {
    return {
      ok: true,
      wrote: false,
      skills_n: skills.length,
      skills: skills,
      packages: pkg
    };
  }
  var body = core.replace(
    '# skills_index\n\n',
    '# skills_index\n\n- at: ' + new Date().toISOString() + '\n'
  );
  fs.writeFileSync(p, body, 'utf8');
  return {
    ok: true,
    wrote: true,
    skills_n: skills.length,
    skills: skills.map(function (s) {
      return {
        child: s.child,
        did_prefix: s.did_prefix,
        n_help: s.n_help,
        id: skillsMod.skillId(s.child, s.did_prefix)
      };
    }),
    packages: pkg,
    path: p
  };
}

module.exports = {
  didPrefix: didPrefix,
  crystallizeSkills: crystallizeSkills
};
