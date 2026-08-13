/**
 * P66 C1: explore densest (host surface / data store / modality lambda).
 * Extracted from runtime.explore.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var surface = require('./surface');

/**
 * Explore externals visible from a modality.
 * @returns {{ ok, phase, modality, externals, summary, note }}
 */
function explore(rootDir, registry, modalityId, opts) {
  opts = opts || {};
  modalityId = modalityId || 'host';
  var found = [];
  var summary = null;
  var thorough = !!opts.thorough;
  var skipApps = !!opts.skip_apps || !!opts.mem_critical;

  if (modalityId === 'host') {
    var hostSurf = surface.exploreHost(rootDir, registry, {
      thorough: thorough,
      skip_apps: skipApps,
      mem_critical: !!opts.mem_critical
    });
    found = hostSurf.externals;
    summary = hostSurf.summary;
  } else if (modalityId === 'data') {
    var store = path.join(rootDir, 'store');
    found.push({
      id: 'store:root',
      kind: 'path',
      path: store,
      exists: fs.existsSync(store)
    });
    found.push({
      id: 'codec:attention-live-v2',
      kind: 'codec'
    });
    found.push({
      id: 'store:pages',
      kind: 'store',
      path: path.join(store, 'pages')
    });
    found.push({
      id: 'store:exports',
      kind: 'store',
      path: path.join(store, 'exports')
    });
    Object.keys(registry).forEach(function (id) {
      if (registry[id].parent_id === 'data') {
        found.push({
          id: 'modality:' + id,
          kind: 'modality_package',
          status: registry[id].status
        });
      }
    });
  } else {
    var child = registry[modalityId];
    if (child && child.manifest && child.manifest.external) {
      found.push(
        Object.assign({ note: 'seed external' }, child.manifest.external)
      );
    }
    if (child && child.lambda && typeof child.lambda.explore === 'function') {
      try {
        var extra = child.lambda.explore() || [];
        found = found.concat(extra);
      } catch (_e0) { /* */ }
    }
  }

  // Append densest explore stamp to EXTERNALS.md (cap lines)
  var m = registry[modalityId];
  if (m && m.dir) {
    var extPath = path.join(m.dir, 'docs', 'EXTERNALS.md');
    var stamp = new Date().toISOString();
    var lines = found.map(function (e) {
      return '- ' + e.id + (e.kind ? ' (' + e.kind + ')' : '');
    });
    if (lines.length > 40) {
      var appsN = found.filter(function (e) {
        return e.kind === 'app';
      }).length;
      var clisN = found.filter(function (e) {
        return e.kind === 'cli';
      }).length;
      lines = lines.slice(0, 24).concat([
        '- … (+' +
          (found.length - 24) +
          ' more; apps=' +
          appsN +
          ' clis=' +
          clisN +
          ')'
      ]);
    }
    var block = '\n\n## explore ' + stamp + '\n' + lines.join('\n') + '\n';
    try {
      fs.appendFileSync(extPath, block);
      if (m.docs) m.docs.EXTERNALS = (m.docs.EXTERNALS || '') + block;
    } catch (_e) { /* */ }
  }

  return {
    ok: true,
    phase: 'explore',
    modality: modalityId,
    externals: found,
    summary: summary,
    note:
      'Candidates for Grok to author as probe modalities (not auto-installed). Use living_scaffold_probe + living_invoke.'
  };
}

module.exports = {
  explore: explore
};
