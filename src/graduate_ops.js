/**
 * P69 C1: graduate · revoke · audit · densifyDocs densest (extracted).
 */
'use strict';

var graduate = require('./graduate');
var densify = require('./densify');
var modality = require('./modality');
var graduateTail = require('./graduate_tail');

function graduateEval(rootDir, registry, writeGraduateTail, modalityId, apply) {
  var result;
  if (!modalityId) {
    result = { ok: true, evaluations: graduate.evaluateAll(rootDir, registry) };
  } else {
    result = graduate.evaluate(rootDir, registry, modalityId, {
      apply: !!apply
    });
  }
  try {
    var write =
      writeGraduateTail ||
      function (evals) {
        return graduateTail.writeGraduateTail(rootDir, evals);
      };
    result.graduate_tail = write(
      modalityId ? [result] : result.evaluations || []
    );
  } catch (_gt) { /* */ }
  return result;
}

function revokeEval(rootDir, registry, modalityId, apply) {
  if (!modalityId) {
    return {
      ok: true,
      evaluations: graduate.evaluateRevokeAll(rootDir, registry, {})
    };
  }
  return graduate.evaluateRevoke(rootDir, registry, modalityId, {
    apply: !!apply
  });
}

function audit(rootDir, registry) {
  return graduate.audit(rootDir, registry);
}

/**
 * Densify docs; returns { result, registry } if registry reloaded.
 */
function densifyDocs(rootDir, registry, opts) {
  opts = opts || {};
  var result = densify.densifyAll(rootDir, {
    modality: opts.modality,
    dry_run: opts.dry_run,
    force: opts.force
  });
  var nextRegistry = registry;
  if (result.ok && !opts.dry_run) {
    nextRegistry = modality.loadRegistry(rootDir);
  }
  return { result: result, registry: nextRegistry };
}

module.exports = {
  graduateEval: graduateEval,
  revokeEval: revokeEval,
  audit: audit,
  densifyDocs: densifyDocs
};
