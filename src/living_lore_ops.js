/**
 * P29/P67 C1: lore densest signal + ops dispatch (extracted).
 */
'use strict';

var lore = require('./lore');

function densestLastLore(rootDir, loop) {
  loop = loop || {};
  if (loop.last_lore && loop.last_lore.text) return loop.last_lore;
  try {
    var sig = lore.densestSignal(rootDir);
    if (sig && sig.text) {
      loop.last_lore = {
        text: sig.text,
        branch: sig.branch,
        rev: sig.rev,
        sync: sig.sync,
        server: sig.server,
        workspace: sig.workspace
      };
      return loop.last_lore;
    }
  } catch (_e) { /* */ }
  return null;
}

function livingLore(rootDir, loop, opts) {
  opts = opts || {};
  loop = loop || {};
  var action = String(opts.action || opts.op || 'status').toLowerCase();
  var result;
  try {
    switch (action) {
      case 'info':
        result = lore.info(rootDir);
        break;
      case 'health':
        result = { ok: true, health: lore.healthSync() };
        break;
      case 'init':
      case 'create':
        result = lore.create(rootDir, {
          name: opts.name,
          url: opts.url,
          remote: opts.remote,
          identity: opts.identity || 'living@joy.local'
        });
        break;
      case 'status':
        result = lore.status(rootDir, {
          scan: !!opts.scan,
          revision_only: !!opts.revision_only
        });
        break;
      case 'stage':
        result = lore.stage(rootDir, {
          paths: opts.paths,
          scan: opts.scan !== false
        });
        break;
      case 'commit':
        result = lore.commit(rootDir, { message: opts.message || opts.msg });
        break;
      case 'push':
        result = lore.push(rootDir);
        break;
      case 'sync':
        result = lore.sync(rootDir);
        break;
      case 'submit':
        result = lore.submit(rootDir, {
          message: opts.message || opts.msg || 'living-core densest submit',
          paths: opts.paths,
          scan: opts.scan !== false,
          push: opts.push !== false
        });
        break;
      case 'signal':
        result = { ok: true, densest: lore.densestSignal(rootDir) };
        break;
      default:
        result = {
          ok: false,
          error: 'unknown_action',
          actions: [
            'info',
            'health',
            'init',
            'status',
            'stage',
            'commit',
            'push',
            'sync',
            'submit',
            'signal'
          ]
        };
    }
  } catch (e) {
    result = { ok: false, error: String(e && e.message || e), action: action };
  }
  try {
    var sig = lore.densestSignal(rootDir);
    if (sig && sig.text) {
      loop.last_lore = {
        text: sig.text,
        branch: sig.branch,
        rev: sig.rev,
        sync: sig.sync,
        server: sig.server,
        workspace: sig.workspace,
        action: action,
        at: new Date().toISOString()
      };
    }
  } catch (_s) { /* */ }
  if (result && typeof result === 'object') {
    result.action = action;
    result.last_lore = loop.last_lore || null;
  }
  return result;
}

module.exports = {
  densestLastLore: densestLastLore,
  livingLore: livingLore
};
