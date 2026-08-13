/**
 * Cold archive compress — layered hide for host bytes (not LLM tokens).
 * Prefer zstd when Node provides it; else gzip. Expand only on intentional read.
 * Law: hop0 never embeds compressed blobs — only cold=zstd:n densest.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var COLD_DIR = 'store/cold';

function coldDir(rootDir) {
  return path.join(rootDir, COLD_DIR);
}

function ensureCold(rootDir) {
  var d = coldDir(rootDir);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function pickAlgo() {
  if (typeof zlib.zstdCompressSync === 'function') return 'zstd';
  return 'gzip';
}

function compressSync(buf) {
  var algo = pickAlgo();
  if (algo === 'zstd') {
    try {
      return { algo: 'zstd', data: zlib.zstdCompressSync(Buffer.from(buf)) };
    } catch (_e) { /* fall through */ }
  }
  return { algo: 'gzip', data: zlib.gzipSync(Buffer.from(buf), { level: 6 }) };
}

function decompressSync(buf, algo) {
  algo = algo || 'gzip';
  if (algo === 'zstd' && typeof zlib.zstdDecompressSync === 'function') {
    return zlib.zstdDecompressSync(Buffer.from(buf));
  }
  if (algo === 'brotli' && zlib.brotliDecompressSync) {
    return zlib.brotliDecompressSync(Buffer.from(buf));
  }
  return zlib.gunzipSync(Buffer.from(buf));
}

/**
 * Archive text/json lines to cold store. Returns densest meta (no payload in hop0).
 * opts: { name, kind }
 */
function archiveText(rootDir, text, opts) {
  opts = opts || {};
  var name = String(opts.name || 'blob')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 48);
  var kind = opts.kind || 'text';
  var raw = Buffer.from(String(text || ''), 'utf8');
  var c = compressSync(raw);
  var dir = ensureCold(rootDir);
  var stamp = new Date().toISOString().replace(/[:.]/g, '-');
  var base = name + '_' + stamp;
  var binPath = path.join(dir, base + '.' + c.algo);
  var metaPath = path.join(dir, base + '.meta.json');
  fs.writeFileSync(binPath, c.data);
  var meta = {
    project: 'living-core',
    law: 'cold archive · hide from hop0 · expand intentional',
    name: name,
    kind: kind,
    algo: c.algo,
    at: new Date().toISOString(),
    bytes_raw: raw.length,
    bytes_cold: c.data.length,
    ratio: raw.length ? Number((raw.length / c.data.length).toFixed(2)) : null,
    file: path.basename(binPath)
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  return {
    ok: true,
    meta: meta,
    path: binPath,
    meta_path: metaPath,
    hop0: c.algo + ':1'
  };
}

/**
 * List cold archives densest (meta only).
 */
function listCold(rootDir) {
  var dir = coldDir(rootDir);
  if (!fs.existsSync(dir)) return { ok: true, n: 0, items: [], hop0: '0' };
  var items = [];
  fs.readdirSync(dir).forEach(function (f) {
    if (!/\.meta\.json$/i.test(f)) return;
    try {
      var m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      items.push(m);
    } catch (_e) { /* */ }
  });
  items.sort(function (a, b) {
    return String(b.at || '').localeCompare(String(a.at || ''));
  });
  var algos = Object.create(null);
  items.forEach(function (m) {
    algos[m.algo || '?'] = (algos[m.algo || '?'] || 0) + 1;
  });
  var hop =
    Object.keys(algos)
      .map(function (a) {
        return a + ':' + algos[a];
      })
      .join(',') || '0';
  return { ok: true, n: items.length, items: items.slice(0, 20), hop0: hop };
}

/**
 * Expand a cold blob by meta file basename or full meta path.
 */
function expand(rootDir, idOrFile) {
  var dir = coldDir(rootDir);
  var metaPath = idOrFile;
  if (!/\.meta\.json$/i.test(String(idOrFile))) {
    // try as name prefix
    if (!fs.existsSync(dir)) return { ok: false, error: 'no_cold' };
    var hit = fs.readdirSync(dir).filter(function (f) {
      return f.indexOf(String(idOrFile)) === 0 && /\.meta\.json$/i.test(f);
    })[0];
    if (!hit) return { ok: false, error: 'not_found' };
    metaPath = path.join(dir, hit);
  } else if (!path.isAbsolute(metaPath)) {
    metaPath = path.join(dir, path.basename(metaPath));
  }
  if (!fs.existsSync(metaPath)) return { ok: false, error: 'meta_missing' };
  var meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  var binPath = path.join(dir, meta.file || '');
  if (!fs.existsSync(binPath)) return { ok: false, error: 'blob_missing', meta: meta };
  var raw = decompressSync(fs.readFileSync(binPath), meta.algo);
  return {
    ok: true,
    meta: meta,
    text: raw.toString('utf8'),
    bytes: raw.length
  };
}

/**
 * Archive oldest slice of samples when over soft cap (caller decides).
 * Returns hop0 densest + whether archived.
 */
function archiveSamplesTail(rootDir, rows, opts) {
  opts = opts || {};
  if (!rows || !rows.length) return { ok: false, error: 'empty' };
  var text = rows.map(function (r) {
    return JSON.stringify(r);
  }).join('\n') + '\n';
  return archiveText(rootDir, text, {
    name: opts.name || 'samples_tail',
    kind: 'samples_jsonl'
  });
}

module.exports = {
  pickAlgo: pickAlgo,
  compressSync: compressSync,
  decompressSync: decompressSync,
  archiveText: archiveText,
  archiveSamplesTail: archiveSamplesTail,
  listCold: listCold,
  expand: expand,
  coldDir: coldDir,
  COLD_DIR: COLD_DIR
};
