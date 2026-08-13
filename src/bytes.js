/**
 * Hard constraint: estimated durable bytes under a cap.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var DEFAULT_CAP = Number(process.env.LIVING_BYTES_CAP || 64 * 1024 * 1024); // 64 MiB

function dirSize(dir, acc) {
  acc = acc || { bytes: 0, files: 0 };
  if (!fs.existsSync(dir)) return acc;
  var entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return acc;
  }
  for (var i = 0; i < entries.length; i++) {
    var p = path.join(dir, entries[i].name);
    if (entries[i].name === 'node_modules' || entries[i].name === '.git') continue;
    if (entries[i].name === 'vendor') continue; // exp6 not "world" bytes
    try {
      if (entries[i].isDirectory()) dirSize(p, acc);
      else {
        acc.bytes += fs.statSync(p).size;
        acc.files++;
      }
    } catch (_e2) { /* */ }
  }
  return acc;
}

function measure(rootDir) {
  var store = path.join(rootDir, 'store');
  var mods = path.join(rootDir, 'modalities');
  var a = dirSize(store, { bytes: 0, files: 0 });
  var b = dirSize(mods, { bytes: 0, files: 0 });
  var est = a.bytes + b.bytes;
  var cap = DEFAULT_CAP;
  return {
    est: est,
    cap: cap,
    pressure: cap > 0 ? est / cap : 0,
    files: a.files + b.files
  };
}

module.exports = {
  measure: measure,
  DEFAULT_CAP: DEFAULT_CAP
};
