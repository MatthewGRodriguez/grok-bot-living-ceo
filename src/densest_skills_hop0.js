/**
 * P15/P68 C1: hop0 skills densest + related neighbors (extracted).
 */
'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Skills from loop.last_skills or skills_index.md densest.
 */
function densestSkills(rootDir, loop) {
  loop = loop || {};
  if (loop.last_skills && loop.last_skills.length) {
    return loop.last_skills.slice(0, 4);
  }
  var p = path.join(rootDir, 'store', 'pages', 'skills_index.md');
  if (!fs.existsSync(p)) return null;
  try {
    var text = fs.readFileSync(p, 'utf8');
    var out = [];
    var re = /^\s*-\s*\*\*([^*]+)\*\*\s*\/\s*`([^`]+)`\s*·\s*help×~?(\d+)/gm;
    var m;
    while ((m = re.exec(text)) !== null && out.length < 4) {
      out.push({
        child: m[1].trim(),
        did_prefix: m[2].trim(),
        n_help: parseInt(m[3], 10)
      });
    }
    return out.length ? out : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Prefer skills of children under parent (P58 parent-local).
 */
function densestSkillsFor(rootDir, registry, loop, parentId) {
  parentId = parentId || 'host';
  var all = densestSkills(rootDir, loop);
  if (!all || !all.length) return null;
  if (parentId === 'host') return all;
  var filtered = all.filter(function (s) {
    var child =
      typeof s === 'string'
        ? s.split('/')[0]
        : s.child || (s.id && String(s.id).split('__')[0]);
    if (child === parentId) return true;
    var m = registry[child];
    return m && m.parent_id === parentId;
  });
  return filtered.length ? filtered.slice(0, 4) : all.slice(0, 2);
}

var LAW_RELATED = {
  reflect_law: 1,
  quality_law: 1,
  wiki_law: 1,
  lore_law: 1
};

/**
 * Parse related_index neighbors for one source page id.
 */
function relatedNeighbors(text, sourceId) {
  var reLine = new RegExp(
    '^\\s*-\\s*\\[\\[' +
      String(sourceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\]\\]\\s*→'
  );
  var lines = String(text || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (!reLine.test(lines[i])) continue;
    var right = lines[i].split('→')[1] || '';
    var hits = [];
    var re = /\[\[([^\]]+)\]\](?:~([0-9.]+))?/g;
    var m;
    while ((m = re.exec(right)) !== null) {
      hits.push(m[1] + (m[2] ? '~' + m[2] : ''));
    }
    return hits;
  }
  return [];
}

/**
 * Top related densest for hop0 related=
 * P76: prefer operate/research edges over pure law triad from hop0_digest.
 */
function densestRelated(rootDir) {
  var p = path.join(rootDir, 'store', 'pages', 'related_index.md');
  if (!fs.existsSync(p)) return null;
  try {
    var text = fs.readFileSync(p, 'utf8');
    var digest = relatedNeighbors(text, 'hop0_digest');
    var close = relatedNeighbors(text, 'operate_close');
    var runtime = relatedNeighbors(text, 'operate_runtime');
    var latest = relatedNeighbors(text, 'research_latest');
    var out = [];
    var seen = Object.create(null);

    function add(list, allowLaw) {
      (list || []).forEach(function (h) {
        if (out.length >= 4) return;
        var id = String(h).split('~')[0];
        if (!id || seen[id]) return;
        if (!allowLaw && LAW_RELATED[id]) return;
        seen[id] = 1;
        out.push(h);
      });
    }

    add(close, false);
    add(runtime, false);
    add(latest, false);
    add(digest, false);
    // fill with digest laws only if still thin
    if (out.length < 3) add(digest, true);
    return out.length ? out.slice(0, 4) : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Modality path segments densest (array for codec.hop0 path.join).
 */
function modalityPath(registry, modalityId) {
  var parts = [];
  var cur = modalityId;
  var guard = 0;
  while (cur && guard++ < 12) {
    parts.unshift(cur);
    var m = registry[cur];
    if (!m || m.parent_id == null) break;
    cur = m.parent_id;
  }
  if (parts[0] !== 'host' && registry.host) parts.unshift('host');
  return parts;
}

module.exports = {
  densestSkills: densestSkills,
  densestSkillsFor: densestSkillsFor,
  densestRelated: densestRelated,
  relatedNeighbors: relatedNeighbors,
  modalityPath: modalityPath
};
