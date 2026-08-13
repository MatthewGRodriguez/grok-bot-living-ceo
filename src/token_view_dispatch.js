/**
 * P30–P33 / P64 C1: token_view action dispatch (extracted from runtime).
 * Factory binds runtime deps (sense, loop, thrash, skills).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var tokenView = require('./token_view');
var samples = require('./samples');
var debt = require('./debt');
var handoffMod = require('./handoff');
var invokeLog = require('./invoke_log');
var bytesMod = require('./bytes');

/**
 * @param {object} deps
 *   rootDir, loop, sense(modality), densestSkillsFor(parent),
 *   densestLinks(), densestRelated(), hostMemSignal(), archiveThrashPages(o)
 */
function createTokenViewDispatch(deps) {
  deps = deps || {};
  var rootDir = deps.rootDir;

  return function tokenViewDispatch(opts) {
    opts = opts || {};
    var loop = deps.loop || {};
    var action = String(opts.action || opts.op || 'status').toLowerCase();

    if (
      action === 'handoff' ||
      action === 'transfer' ||
      action === 'attention_handoff'
    ) {
      try {
        var hereH = String(
          opts.modality || opts.here || opts.parent || 'host'
        );
        var s = deps.sense(hereH);
        var hopLines = (s.hop0 && s.hop0.lines) || [];
        var pick = function (prefix) {
          for (var i = 0; i < hopLines.length; i++) {
            if (String(hopLines[i]).indexOf(prefix) === 0) {
              return String(hopLines[i]).slice(prefix.length);
            }
          }
          return null;
        };
        var debtH = null;
        try {
          debtH = debt.debtForParent
            ? debt.debtForParent(rootDir, hereH)
            : hereH === 'host'
              ? debt.hostDebt(rootDir)
              : null;
        } catch (_dh) {
          debtH = null;
        }
        return handoffMod.buildHandoff(rootDir, {
          here: hereH,
          modality: hereH,
          parent: hereH,
          codec: s.hop0 && s.hop0.codec,
          open_next: pick('open_next='),
          forecast: pick('forecast='),
          skills: deps.densestSkillsFor
            ? deps.densestSkillsFor(hereH)
            : null,
          links: deps.densestLinks ? deps.densestLinks() : null,
          related:
            hereH === 'host' && deps.densestRelated
              ? deps.densestRelated()
              : null,
          debt: debtH && debtH.has ? debtH : null,
          why: loop.last_why || null,
          last_best: loop.last_best,
          parent_j: loop.parent_j,
          open_goal: loop.open_goal,
          loop: loop,
          no_help_streak: loop.no_help_streak,
          binary: pick('binary='),
          hop0_text: s.hop0 && s.hop0.text,
          format: opts.format || 'toon'
        });
      } catch (e) {
        return { ok: false, error: 'handoff_failed:' + e.message };
      }
    }

    if (action === 'status' || action === 'plan') {
      return tokenView.status(rootDir, {
        recent_n: opts.recent_n || 12,
        format: opts.format || 'toon'
      });
    }

    if (action === 'pack' || action === 'toon') {
      var rows = opts.rows;
      var packName = opts.name || 'samples';
      var kind = String(opts.kind || packName || '').toLowerCase();
      var rankingRoot =
        opts.ranking_root ||
        process.env.REVIEW_SOT_ROOT ||
        path.resolve(rootDir, '..', 'legacy', 'legacy', 'html');

      if (!rows && (kind === 'edges' || packName === 'edges')) {
        try {
          var edgesPath = path.join(rankingRoot, 'joys', 'relations.json');
          if (fs.existsSync(edgesPath)) {
            var rel = JSON.parse(fs.readFileSync(edgesPath, 'utf8'));
            rows = (rel.edges || []).map(function (e) {
              return { from: e.from, to: e.to, label: e.label || '' };
            });
            packName = 'edges';
          }
        } catch (_ed) {
          rows = null;
        }
      }
      if (!rows && (kind === 'actions' || packName === 'actions')) {
        try {
          var rankingBridge = require('./ranking_bridge');
          var acts = rankingBridge.dispatch({
            action: 'list_actions',
            ranking_root: rankingRoot
          });
          rows = (acts.actions || []).map(function (a) {
            return {
              id: a.id,
              name: a.name,
              kind: a.kind || '',
              pol: a.polarity || '',
              amt: a.amountMonthly != null ? a.amountMonthly : a.amount || 0,
              cad: a.cadence || ''
            };
          });
          packName = 'actions';
        } catch (_ac) {
          rows = null;
        }
      }
      if (!rows && (kind === 'joys' || packName === 'joys')) {
        try {
          var rankingBridge2 = require('./ranking_bridge');
          var jl = rankingBridge2.dispatch({
            action: 'list',
            ranking_root: rankingRoot
          });
          rows = (jl.disk || []).map(function (j) {
            var m = j.manifest || {};
            return {
              id: j.id || m.id,
              title: m.title || j.id || '',
              pol: m.polarity || '',
              status: m.status || '',
              jmethod: j.has_jmethod ? 1 : 0
            };
          });
          packName = 'joys';
        } catch (_jy) {
          rows = null;
        }
      }
      if (
        !rows &&
        (kind === 'invoke' ||
          kind === 'invokes' ||
          packName === 'invoke' ||
          packName === 'invokes')
      ) {
        try {
          var invRows = invokeLog.listRecent
            ? invokeLog.listRecent(rootDir, opts.recent_n || 12)
            : invokeLog.readAll(rootDir).slice(-(opts.recent_n || 12));
          rows = invokeLog.slimForPrompt
            ? invokeLog.slimForPrompt(invRows)
            : invRows.map(function (r) {
                return {
                  at: r.at || '',
                  id: r.id || '',
                  ok: r.ok === false ? 0 : 1,
                  kind: r.kind || '',
                  action: r.action || '',
                  did: r.did || ''
                };
              });
          packName = 'invoke';
        } catch (_inv) {
          rows = null;
        }
      }
      if (!rows) {
        rows = samples
          .listRecent(rootDir, opts.recent_n || 12, { for_prompt: true })
          .map(function (r) {
            return {
              at: r.at,
              parent: r.parent,
              child: r.child,
              j: r.j,
              help: r.did_help ? 1 : 0,
              status: r.status
            };
          });
      }
      return tokenView.packRows(rows, {
        format: opts.format || 'toon',
        name: packName
      });
    }

    if (action === 'compare') {
      var rows2 =
        opts.rows ||
        samples
          .listRecent(rootDir, opts.recent_n || 20, { for_prompt: true })
          .map(function (r) {
            return { child: r.child, j: r.j, help: r.did_help ? 1 : 0 };
          });
      return tokenView.toon.compareViews(rows2, {
        name: opts.name || 'samples'
      });
    }
    if (action === 'purge_noise' || action === 'sample_hygiene') {
      return samples.purgeNoise(rootDir, { apply: opts.apply !== false });
    }
    if (action === 'archive_thrash' || action === 'thrash_cold') {
      return deps.archiveThrashPages
        ? deps.archiveThrashPages({ apply: opts.apply !== false })
        : { ok: false, error: 'no_thrash' };
    }
    if (action === 'cold_list' || action === 'list_cold') {
      return tokenView.cold.listCold(rootDir);
    }
    if (action === 'cold_expand' || action === 'expand') {
      return tokenView.cold.expand(
        rootDir,
        opts.id || opts.file || opts.name
      );
    }
    if (action === 'archive_samples') {
      return tokenView.maybeArchiveSamples(rootDir, {
        cap: opts.cap != null ? opts.cap : 400,
        apply_trim: !!opts.apply_trim
      });
    }
    if (action === 'hide') {
      var mem = deps.hostMemSignal ? deps.hostMemSignal() : null;
      return tokenView.hidePlan({
        free_gb: mem && mem.free_gb,
        bytes_pressure: bytesMod.measure(rootDir).pressure
      });
    }
    return {
      ok: false,
      error: 'unknown_action',
      actions: [
        'status',
        'pack',
        'compare',
        'handoff',
        'cold_list',
        'cold_expand',
        'archive_samples',
        'hide',
        'purge_noise',
        'archive_thrash'
      ]
    };
  };
}

module.exports = {
  createTokenViewDispatch: createTokenViewDispatch
};
