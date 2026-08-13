/**
 * densest TOON-ish encode/decode — Token-Oriented Object Notation pilot.
 * Law: JSON SoT programmatically; TOON only at LLM boundary.
 * Uniform arrays of objects → tabular form (fields once). Nested → compact JSON fallback.
 * Spec-inspired (toonformat.dev) — not a full multi-lang runtime; enough for living-core tails.
 */
'use strict';

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isPrimitive(v) {
  return (
    v == null ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
  );
}

function escapeCell(v) {
  if (v == null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  var s = String(v);
  if (/[",\n\r\t]/.test(s) || s.indexOf(':') >= 0) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
}

function fieldsUnion(rows) {
  var keys = [];
  var seen = Object.create(null);
  rows.forEach(function (row) {
    if (!isPlainObject(row)) return;
    Object.keys(row).forEach(function (k) {
      if (!seen[k]) {
        seen[k] = 1;
        keys.push(k);
      }
    });
  });
  return keys;
}

function uniformObjectArray(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  for (var i = 0; i < rows.length; i++) {
    if (!isPlainObject(rows[i])) return false;
    // reject nested objects/arrays as values for tabular form
    var keys = Object.keys(rows[i]);
    for (var k = 0; k < keys.length; k++) {
      var v = rows[i][keys[k]];
      if (!isPrimitive(v)) return false;
    }
  }
  return true;
}

/**
 * Encode value to densest TOON-ish text.
 * opts: { name } optional root array name
 */
function encode(value, opts) {
  opts = opts || {};
  if (Array.isArray(value) && uniformObjectArray(value)) {
    var fields = fieldsUnion(value);
    var name = opts.name || 'items';
    var lines = [];
    lines.push(name + '[' + value.length + ']{' + fields.join(',') + '}:');
    value.forEach(function (row) {
      lines.push(
        '  ' +
          fields
            .map(function (f) {
              return escapeCell(row[f]);
            })
            .join(',')
      );
    });
    return {
      ok: true,
      format: 'toon',
      form: 'tabular',
      text: lines.join('\n'),
      rows: value.length,
      fields: fields,
      note: 'uniform object array · LLM boundary'
    };
  }
  // simple key=value object (flat primitives)
  if (isPlainObject(value)) {
    var flat = true;
    Object.keys(value).forEach(function (k) {
      if (!isPrimitive(value[k])) flat = false;
    });
    if (flat) {
      var lines2 = Object.keys(value).map(function (k) {
        return k + ': ' + escapeCell(value[k]);
      });
      return {
        ok: true,
        format: 'toon',
        form: 'kv',
        text: lines2.join('\n'),
        rows: 1,
        fields: Object.keys(value),
        note: 'flat object · LLM boundary'
      };
    }
  }
  // fallback compact JSON (still better tokens than pretty)
  try {
    var j = JSON.stringify(value);
    return {
      ok: true,
      format: 'json_compact',
      form: 'json',
      text: j,
      rows: Array.isArray(value) ? value.length : 1,
      fields: null,
      note: 'nested/non-uniform · compact JSON fallback'
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

function parseCell(s) {
  s = String(s == null ? '' : s).trim();
  if (s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
    return s
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/**
 * Decode densest tabular TOON or compact JSON.
 */
function decode(text) {
  text = String(text || '').trim();
  if (!text) return { ok: false, error: 'empty' };
  // compact JSON fallback
  if (text.charAt(0) === '{' || text.charAt(0) === '[') {
    try {
      return { ok: true, format: 'json_compact', value: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: 'json_parse: ' + (e && e.message) };
    }
  }
  var lines = text.split(/\n/);
  var header = lines[0] || '';
  // name[N]{a,b,c}:
  var m = header.match(/^([A-Za-z_][\w]*)\[(\d+)\]\{([^}]*)\}:\s*$/);
  if (!m) {
    // kv form
    var obj = {};
    var kvOk = true;
    lines.forEach(function (line) {
      var i = line.indexOf(':');
      if (i < 0) {
        kvOk = false;
        return;
      }
      obj[line.slice(0, i).trim()] = parseCell(line.slice(i + 1));
    });
    if (kvOk && Object.keys(obj).length) {
      return { ok: true, format: 'toon', form: 'kv', value: obj };
    }
    return { ok: false, error: 'unrecognized_toon' };
  }
  var n = parseInt(m[2], 10);
  var fields = m[3].split(',').map(function (f) {
    return f.trim();
  }).filter(Boolean);
  var rows = [];
  for (var li = 1; li < lines.length; li++) {
    var line = lines[li].replace(/^\s+/, '');
    if (!line) continue;
    // simple split on commas not inside quotes
    var cells = [];
    var cur = '';
    var inQ = false;
    for (var ci = 0; ci < line.length; ci++) {
      var ch = line.charAt(ci);
      if (ch === '"' && (ci === 0 || line.charAt(ci - 1) !== '\\')) inQ = !inQ;
      if (ch === ',' && !inQ) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    var row = {};
    fields.forEach(function (f, fi) {
      row[f] = parseCell(cells[fi] != null ? cells[fi] : '');
    });
    rows.push(row);
  }
  return {
    ok: true,
    format: 'toon',
    form: 'tabular',
    value: rows,
    declared_n: n,
    fields: fields,
    note: rows.length === n ? 'length_match' : 'length_mismatch'
  };
}

/**
 * Rough token estimate densest (chars/4) for before/after compare.
 */
function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

/**
 * Compare JSON pretty / compact / TOON token estimates for a value.
 */
function compareViews(value, opts) {
  opts = opts || {};
  var pretty = JSON.stringify(value, null, 2);
  var compact = JSON.stringify(value);
  var toon = encode(value, opts);
  return {
    ok: true,
    pretty_chars: pretty.length,
    compact_chars: compact.length,
    toon_chars: toon.ok ? toon.text.length : null,
    pretty_tok_est: estimateTokens(pretty),
    compact_tok_est: estimateTokens(compact),
    toon_tok_est: toon.ok ? estimateTokens(toon.text) : null,
    toon_vs_pretty:
      toon.ok && pretty.length
        ? Number((1 - toon.text.length / pretty.length).toFixed(3))
        : null,
    toon_vs_compact:
      toon.ok && compact.length
        ? Number((1 - toon.text.length / compact.length).toFixed(3))
        : null,
    format: toon.format,
    form: toon.form,
    text: toon.ok ? toon.text : null,
    note: toon.note || toon.error
  };
}

module.exports = {
  encode: encode,
  decode: decode,
  estimateTokens: estimateTokens,
  compareViews: compareViews,
  uniformObjectArray: uniformObjectArray
};
