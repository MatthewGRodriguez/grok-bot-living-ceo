/**
 * attention-live-v2 — densest first, loop always in hop0.
 * Pilot P30–P34: token_view · hidden layers · cold archive densest.
 * P44 B3: KV-cache friendly order — stable law first · dynamic last.
 * Law: disk JSON/md SoT · prompt TOON/densest · zstd|gzip cold only · hide≠delete
 */
'use strict';

var CODEC = 'attention-live-v2';
var CODEC_V1 = 'attention-live-v1';

/**
 * Build hop0 lines.
 * Order densest (P44):
 *   stable  → identity · law · preflight · goals · links (prefix-cache friendly)
 *   semi    → skills · open_next · accel
 *   dynamic → bytes · loop · mem · perf · why · ranks · tails · token_view
 */
function hop0(opts) {
  opts = opts || {};
  var stable = [];
  var semi = [];
  var dynamic = [];

  // —— STABLE prefix (same across quiet turns) ——
  stable.push(
    'here=' + (opts.here || 'host') +
    (opts.path && opts.path.length ? ' path=' + opts.path.join('›') : '') +
    ' modality=' + (opts.modality || 'host') +
    ' status=' + (opts.status || 'stable')
  );
  // P11/P18/P27: quality + ponytail densest (fixed string → KV prefix)
  if (opts.quality_law !== false) {
    stable.push(
      'law=speed≠everything · smarter≠faster · clearer≠optimal · write_only_needed · thorough ok if densest help'
    );
  }
  // P26: loop preflight
  if (opts.loop_ok) {
    var lo = opts.loop_ok;
    stable.push(
      'loop_ok=' +
      (lo.ok ? 'Y' : 'N') +
      ' repeat=' +
      (lo.repeat ? 'Y' : 'N') +
      ' gate=' +
      (lo.gate ? 'Y' : 'N') +
      ' budget=' +
      (lo.budget ? 'Y' : 'N') +
      ' tools=' +
      (lo.tools ? 'Y' : 'N') +
      (lo.note ? ' · ' + String(lo.note).slice(0, 40) : '')
    );
  }
  if (opts.goals && opts.goals.length) {
    stable.push(
      'goals=' +
      opts.goals.slice(0, 6).map(function (g) {
        return (g.id || g.title || '?') +
          (g.status ? '/' + g.status : '');
      }).join(' ')
    );
  }
  if (opts.links && opts.links.length) {
    stable.push(
      'links=' +
      opts.links
        .slice(0, 6)
        .map(function (l) {
          return l.id || l;
        })
        .join(' ')
    );
  }

  // —— SEMI (change slowly) ——
  if (opts.skills && opts.skills.length) {
    semi.push(
      'skills=' +
      opts.skills
        .slice(0, 4)
        .map(function (s) {
          if (typeof s === 'string') return s;
          return (
            (s.child || s.id || '?') +
            '/' +
            (s.did_prefix || s.did || '?') +
            (s.n_help != null ? '×' + s.n_help : '')
          );
        })
        .join(' ')
    );
  }
  if (opts.open_next) {
    semi.push('open_next=' + String(opts.open_next).slice(0, 96));
  }
  // P56: SparDA-inspired next densest act (tool · skill · page)
  if (opts.forecast) {
    semi.push('forecast=' + String(opts.forecast).slice(0, 96));
  }
  if (opts.accel) {
    var ac = opts.accel;
    semi.push(
      'accel=' +
      (ac.simd ? (ac.simd_lane ? 'simd' : 'wasm') : 'no_simd') +
      (ac.workers ? ' workers=' + (ac.workers_n || 1) : ' workers=0') +
      (ac.gpu ? ' gpu=1' : ' gpu=0') +
      (ac.score_backend ? ' score=' + ac.score_backend : '') +
      (ac.related ? ' related=' + ac.related : '') +
      (ac.mem_critical ? ' · critical' : '') +
      (ac.thr ? ' · thr ' + ac.thr : '')
    );
  }
  // P48: binary boundary densest (wasm/cold islands · source stays JS)
  if (opts.binary) {
    var bin = opts.binary;
    semi.push(
      'binary=' +
      (typeof bin === 'string'
        ? String(bin).slice(0, 96)
        : bin.hop0
          ? String(bin.hop0).slice(0, 96)
          : 'src=js')
    );
  }
  if (opts.related && opts.related.length) {
    semi.push(
      'related=' +
      opts.related
        .slice(0, 4)
        .map(function (r) {
          return typeof r === 'string' ? r : r.id || r;
        })
        .join(' ')
    );
  }
  if (opts.exo || opts.exotelos) {
    var exoLine =
      typeof opts.exo === 'string'
        ? opts.exo
        : opts.exotelos
          ? require('./exotelos').hop0Line(opts.exotelos)
          : null;
    if (exoLine) {
      semi.push(exoLine.indexOf('exo=') === 0 ? exoLine : 'exo=' + exoLine);
    }
  }
  if (opts.bonds_line) {
    var bl =
      typeof opts.bonds_line === 'string'
        ? opts.bonds_line
        : require('./exotelos').hop0BondsLine(opts.bonds_line);
    if (bl) semi.push(bl.indexOf('bonds=') === 0 ? bl : 'bonds=' + bl);
  }

  // —— DYNAMIC suffix (changes every hop) ——
  var bytes = opts.bytes || {};
  dynamic.push(
    'bytes_est=' + (bytes.est != null ? bytes.est : 0) +
    ' bytes_cap=' + (bytes.cap != null ? bytes.cap : 0) +
    ' pressure=' + (bytes.pressure != null ? Number(bytes.pressure).toFixed(3) : 0)
  );
  var loop = opts.loop || {};
  dynamic.push(
    'loop=' + (loop.phase || 'sense') +
    ' open_goal=' + (opts.open_goal || loop.open_goal || '—') +
    ' last_best=' + (loop.last_best || '—') +
    ' parent_j=' + (loop.parent_j != null ? Number(loop.parent_j).toFixed(4) : '—') +
    (loop.simulated ? ' simulated=1' : '') +
    (loop.thorough ? ' thorough=1' : '')
  );
  if (opts.perf && opts.perf.total_ms != null) {
    dynamic.push(
      'perf=total=' +
      opts.perf.total_ms +
      ' explore=' +
      (opts.perf.explore_ms != null ? opts.perf.explore_ms : '?') +
      ' sim=' +
      (opts.perf.sim_ms != null ? opts.perf.sim_ms : '?') +
      ' best=' +
      (opts.perf.best_ms != null ? opts.perf.best_ms : '?') +
      (opts.perf.thorough ? ' thorough' : ' fast')
    );
  }
  if (opts.mem && opts.mem.free_gb != null) {
    var pressure =
      opts.mem.pressure ||
      (opts.mem.free_gb < 0.2
        ? 'critical'
        : opts.mem.free_gb < 0.4
          ? 'high'
          : opts.mem.free_gb < 1
            ? 'med'
            : 'ok');
    dynamic.push(
      'mem=free_gb=' +
      Number(opts.mem.free_gb).toFixed(2) +
      ' pressure=' +
      pressure +
      (opts.mem.trim ? ' trim=' + opts.mem.trim : '') +
      (opts.mem.densify ? ' densify=1' : '') +
      (opts.mem.apps_skipped ? ' apps_skip=1' : '') +
      (opts.mem.probe_skip ? ' probe_skip=1' : '') +
      (opts.mem.lean ? ' lean=1' : '')
    );
  }
  if (opts.lifecycle && opts.lifecycle.length) {
    dynamic.push(
      'lifecycle=' +
      opts.lifecycle
        .slice(0, 6)
        .map(function (x) {
          return (
            (x.short || x.id || '?') +
            ':' +
            (x.status || '?') +
            (x.flag ? '!' + x.flag : '')
          );
        })
        .join(' ')
    );
  }
  if (opts.session && opts.session.length) {
    dynamic.push(
      'session=' +
      opts.session
        .slice(0, 3)
        .map(function (s) {
          if (typeof s === 'string') return s;
          return (
            (s.child || s.id || '?') +
            '/' +
            (s.help === true || s.helped === true ? 'Y' : s.help === false || s.helped === false ? 'N' : '?') +
            (s.j != null ? '/' + Number(s.j).toFixed(2) : '')
          );
        })
        .join(' ')
    );
  }
  if (opts.last_capture && opts.last_capture.text) {
    var lc = opts.last_capture;
    dynamic.push(
      'last_capture=' +
      (lc.kind || 'capture') +
      ' · ' +
      String(lc.text).slice(0, 72)
    );
  }
  if (opts.last_lore) {
    var ll = opts.last_lore;
    var loreText =
      typeof ll === 'string'
        ? ll
        : ll.text ||
          ((ll.branch || '—') +
            (ll.rev != null ? ' r' + ll.rev : '') +
            (ll.sync ? ' ' + ll.sync : ''));
    dynamic.push('last_lore=' + String(loreText).slice(0, 80));
  }
  // P18/P19: reify last Best decision densest
  if (opts.why && opts.why.child) {
    var w = opts.why;
    var densifyReason = function (r) {
      var s = String(r || '');
      var neg = s.charAt(0) === '-';
      var pos = s.charAt(0) === '+';
      var body = s.replace(/^[+\-]/, '');
      if (/wrote_exists:/i.test(body) || /^wrote:/i.test(body)) {
        var f = body.split(':')[1] || body;
        return (neg ? '-' : '+') + 'wrote:' + f.replace(/\.md$/i, '').slice(0, 18);
      }
      if (/verify_only/i.test(body)) return '-verify';
      if (/no_densest_change|unchanged/i.test(body)) return '-unchanged';
      if (/same_path_no_delta|struct_delta/i.test(body)) {
        return neg ? '-no_delta' : '+delta';
      }
      if (/self_help/i.test(body)) return '+self';
      if (/bytes_ok/i.test(body)) return '+bytes';
      if (/memory_surface|data_child/i.test(body)) return '+durable';
      if (/probe_not|not_host_goal/i.test(body)) return '-probe_goal';
      if (/no_path|no_self_no_durable/i.test(body)) return '-no_path';
      if (/ensure_store/i.test(body)) return '+store';
      if (/structured_len/i.test(body)) return pos || !neg ? '+struct' : '-struct';
      return (neg ? '-' : pos ? '+' : '') + body.slice(0, 16);
    };
    var reasons = (w.reasons || [])
      .slice(0, 4)
      .map(densifyReason)
      .filter(Boolean)
      .join('·');
    var didShort = '';
    if (w.did) {
      var d = String(w.did);
      if (d.indexOf('wrote:') === 0) {
        didShort = 'did=wrote:' + d.slice(6).replace(/\.md$/i, '').slice(0, 18);
      } else if (d.indexOf('verified:') === 0) {
        didShort = 'did=verify';
      } else {
        didShort = 'did=' + d.split('+')[0].slice(0, 20);
      }
    }
    var exploreShort = '';
    if (w.explore) {
      var ex = String(w.explore);
      if (ex.indexOf('mem_critical_skip_probe') >= 0) exploreShort = 'pick=skip_probe';
      else if (ex.indexOf('no_help_streak') >= 0) exploreShort = 'pick=#2_streak';
      else if (ex.indexOf('no_help_explore') >= 0) exploreShort = 'pick=#2';
      else if (ex.indexOf('enter_top') >= 0) exploreShort = 'pick=top';
      else exploreShort = 'pick=' + ex.slice(0, 16);
    }
    dynamic.push(
      'why=' +
      (w.child || '?') +
      ' help=' +
      (w.helped === true ? 'Y' : w.helped === false ? 'N' : '?') +
      (w.j != null ? ' j=' + Number(w.j).toFixed(2) : '') +
      (didShort ? ' ' + didShort : '') +
      (exploreShort ? ' ' + exploreShort : '') +
      (reasons ? ' · ' + reasons : '')
    );
  }
  if (opts.children_ranked && opts.children_ranked.length) {
    dynamic.push(
      'children_ranked=' +
      opts.children_ranked.slice(0, 12).map(function (c) {
        // P75: — for unscored (not ?) · honest hop0
        return c.id + ':' +
          (c.j != null && isFinite(Number(c.j))
            ? Number(c.j).toFixed(3)
            : '—') +
          ':' + (c.status || 'probe');
      }).join(' ')
    );
  } else {
    dynamic.push('children_ranked=0');
  }
  if (opts.externals_n != null || (opts.externals && opts.externals.length)) {
    var n = opts.externals_n != null
      ? opts.externals_n
      : opts.externals.length;
    var top = (opts.externals || []).slice(0, 4).map(function (e) {
      return e.id || e.name || e;
    }).join(',');
    dynamic.push('externals_new=' + n + (top ? ' · ' + top : ''));
  }
  if (opts.nested_chain && opts.nested_chain.length) {
    dynamic.push(
      'nested=' +
      opts.nested_chain
        .slice(0, 6)
        .map(function (x) {
          return (x.id || x) + (x.helped === false ? '!' : '');
        })
        .join('›')
    );
  }
  if (opts.debt && opts.debt.has) {
    dynamic.push(
      'debt=' +
      (opts.debt.reasons || []).slice(0, 4).join(',')
    );
  }
  if (opts.last_invoke && opts.last_invoke.id) {
    dynamic.push(
      'last_invoke=' +
      opts.last_invoke.id +
      (opts.last_invoke.ok === false ? '!' : '') +
      (opts.last_invoke.action ? '/' + String(opts.last_invoke.action).slice(0, 24) : '') +
      (opts.last_invoke.did ? ' · ' + String(opts.last_invoke.did).slice(0, 48) : '')
    );
  }
  if (opts.research_tail) {
    dynamic.push('research_tail=' + String(opts.research_tail).slice(0, 120));
  }
  if (opts.token_view || opts.hidden || opts.cold) {
    dynamic.push(
      'token_view=' +
        (opts.token_view || 'toon') +
        (opts.tok_est_samples != null ? ' samples_tok~' + opts.tok_est_samples : '') +
        (opts.tok_save != null ? ' save~' + opts.tok_save : '')
    );
    dynamic.push(
      'hidden=' +
        (opts.hidden || 'L4_raw') +
        ' cold=' +
        (opts.cold || '0') +
        (opts.cold_algo ? ' algo=' + opts.cold_algo : '')
    );
  }

  var lines = stable.concat(semi).concat(dynamic);
  return {
    codec: CODEC,
    line0: lines[0],
    lines: lines,
    text: lines.join('\n'),
    densest: true
  };
}

module.exports = {
  CODEC: CODEC,
  CODEC_V1: CODEC_V1,
  hop0: hop0
};
