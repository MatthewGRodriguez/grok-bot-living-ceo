/**
 * P14/P67 C1: densest lifecycle flags for probe/testing (extracted).
 */
'use strict';

var samples = require('./samples');
var invokeLog = require('./invoke_log');

function densestLifecycle(rootDir, registry) {
  var out = [];
  Object.keys(registry).forEach(function (id) {
    var m = registry[id];
    if (!m || m.status === 'revoked' || m.status === 'stable') return;
    if (m.status !== 'probe' && m.status !== 'testing') return;
    var short = String(id)
      .replace(/^probe_app_/, '')
      .replace(/^probe_cli_/, '')
      .slice(0, 16);
    var flag = null;
    try {
      var extObj = m.manifest && m.manifest.external;
      var ext =
        (m.manifest && m.manifest.external_id) ||
        (extObj && typeof extObj === 'object' ? extObj.id : null) ||
        (typeof extObj === 'string' ? extObj : null) ||
        null;
      if (ext) {
        var st = invokeLog.statsForExternal(rootDir, ext);
        if (!st.ok_n) flag = 'invoke';
      } else if (m.status === 'probe') {
        flag = 'invoke';
      }
      var n = samples.statsFor
        ? (samples.statsFor(rootDir, id) || {}).n
        : null;
      if (n == null) {
        try {
          var all = samples.readAll(rootDir).filter(function (r) {
            return r && r.child === id;
          });
          n = all.length;
        } catch (_s) {
          n = null;
        }
      }
      if (n === 0 && !flag) flag = 'samples';
    } catch (_e) { /* */ }
    out.push({ id: id, short: short, status: m.status, flag: flag });
  });
  return out;
}

/**
 * Hop0 densest lifecycle line fragments.
 */
function hop0LifecycleLine(rootDir, registry) {
  var list = densestLifecycle(rootDir, registry);
  if (!list.length) return null;
  return list
    .slice(0, 6)
    .map(function (x) {
      return x.short + (x.flag ? '!' + x.flag : ':' + x.status);
    })
    .join(' ');
}

module.exports = {
  densestLifecycle: densestLifecycle,
  hop0LifecycleLine: hop0LifecycleLine
};
