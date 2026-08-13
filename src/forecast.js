/**
 * P56/P58 — densest forecast (SparDA-inspired process analog).
 * Predict next tool / skill / page from open_next · debt · skills · last_best.
 * Parent-local (any modality), not host-only. Closed map — no embedding farm.
 */
'use strict';

var exotelos = require('./exotelos');

/**
 * Build densest forecast string (≤96 chars for hop0).
 * opts: {
 *   open_next, debt, skills, last_best, last_why,
 *   parent_j, no_help_streak, open_goal, parent / here, bonds
 * }
 */
function densestForecast(opts) {
  opts = opts || {};
  var on = String(opts.open_next || '');
  var debt = opts.debt;
  var skills = Array.isArray(opts.skills) ? opts.skills : [];
  var lastBest = opts.last_best || null;
  var streak = opts.no_help_streak != null ? Number(opts.no_help_streak) : 0;
  var why = opts.last_why || null;
  var parent = String(opts.parent || opts.here || 'host');
  var bondHint = null;
  try {
    bondHint = exotelos.bondOpenHint(opts.bonds || [], {
      open_goal: opts.open_goal || opts.goal || '',
      open_next: on
    });
  } catch (_bh) {
    bondHint = null;
  }

  // Debt / open_next closed forms first (highest densest help)
  if (debt && debt.has) {
    var r0 = (debt.reasons && debt.reasons[0]) || 'debt';
    if (/calendar/i.test(String(r0)) || /calendar_debt/i.test(on)) {
      return clip('Best calendar_layers · page:calendar_layers');
    }
    if (/samples_over|craft_pages|missing_data|data_index|exports/i.test(String(r0)) || /data_debt/i.test(on)) {
      return clip(
        parent === 'data'
          ? 'Best pages · page:data_index'
          : 'Best data · page:data_index'
      );
    }
    if (/research_stale|research_thin|missing_research/i.test(String(r0))) {
      return clip('Best research · page:research_latest · skill:research__wrote');
    }
  }
  if (/calendar_debt/i.test(on)) {
    return clip('Best calendar_layers · page:calendar_layers');
  }
  if (/data_debt/i.test(on)) {
    return clip(
      parent === 'data' ? 'Best pages · page:data_index' : 'Best data · page:data_index'
    );
  }
  if (/research_debt/i.test(on)) {
    return clip('Best research · page:research_latest · skill:research__wrote');
  }
  if (/\bREVIEW\b/i.test(on)) {
    return clip('living_ranking review · page:operate_review');
  }

  // Parent-local non-host rest paths (+ soft bond partner)
  if (parent && parent !== 'host') {
    if (/calendar_current/i.test(on)) {
      return clip('rest · page:calendar_layers · money SoT sheet');
    }
    if (/research densest/i.test(on)) {
      return clip(
        softBondForecast(
          'living_skill get research__wrote · page:research_latest',
          bondHint
        )
      );
    }
    if (/crystallize densest/i.test(on)) {
      return clip(
        softBondForecast(
          'living_skill get crystallize__wrote · page:hop0_digest',
          bondHint
        )
      );
    }
    if (/rankCycle parent=/i.test(on)) {
      return clip(
        softBondForecast(
          'living_rank_cycle parent=' + parent + ' · page:operate_close',
          bondHint
        )
      );
    }
    if (/here=.*rest/i.test(on) && /return host/i.test(on)) {
      return clip('living_sense host · page:operate_close');
    }
    // leaf / probe with no children — return host densest (not farm local Best)
    if (/^here=/i.test(on) && /rest/i.test(on)) {
      return clip('living_sense host · page:operate_close');
    }
  }

  // No-help streak → explore #2 path (skill still useful)
  if (streak >= 2) {
    var sk2 = topSkill(skills, lastBest);
    return clip(
      'rankCycle explore#2' +
        (sk2 ? ' · skill:' + sk2 : '') +
        ' · page:operate_close'
    );
  }

  // operate_close steady — prefer rankCycle; skill from samples; bond hit → Best partner
  if (/operate_close/i.test(on)) {
    if (bondHint && bondHint.hit && bondHint.to) {
      return clip(
        'Best ' +
          bondHint.to +
          ' · ' +
          bondHint.tag +
          ' · page:operate_close'
      );
    }
    var sk = topSkill(skills, lastBest);
    var page =
      lastBest === 'research'
        ? 'research_latest'
        : lastBest === 'crystallize'
          ? 'hop0_digest'
          : 'operate_close';
    // If last Best helped research, forecast skill package JIT
    if (why && why.helped && why.child === 'research') {
      return clip(
        softBondForecast(
          'living_rank_cycle · skill:research__wrote · page:' + page,
          bondHint
        )
      );
    }
    return clip(
      softBondForecast(
        'living_rank_cycle' +
          (sk ? ' · skill:' + sk : '') +
          ' · page:' +
          page,
        bondHint
      )
    );
  }

  // ranking / token road leftovers
  if (/TOON|token/i.test(on)) {
    return clip('living_token_view pack · page:operate_token_pilot');
  }

  // P57: improve living-core / research goal (user-named densest)
  var goal = String(opts.open_goal || opts.goal || '');
  if (/improve\s*living|nvidia|kv.?handoff|second.?brain/i.test(goal + ' ' + on)) {
    return clip(
      'living_rank_cycle · skill:research__wrote · page:research_nvidia_kv_handoff'
    );
  }

  // default densest (parent-local rankCycle when not host)
  var sk0 = topSkill(skills, lastBest);
  var parentClause =
    parent && parent !== 'host' ? ' parent=' + parent : '';
  return clip(
    softBondForecast(
      'living_rank_cycle' +
        parentClause +
        (sk0 ? ' · skill:' + sk0 : '') +
        ' · page:operate_close',
      bondHint
    )
  );
}

function softBondForecast(line, bondHint) {
  if (!bondHint || !bondHint.to) return line;
  if (String(line).indexOf('bond→') >= 0) return line;
  if (String(line).indexOf(bondHint.to) >= 0) return line;
  var add = ' · ' + bondHint.tag;
  if (String(line).length + add.length <= 96) return line + add;
  return line;
}

function topSkill(skills, lastBest) {
  if (!skills.length) return null;
  // Prefer skill matching last_best child
  if (lastBest) {
    for (var i = 0; i < skills.length; i++) {
      var s = skills[i];
      var child = typeof s === 'string' ? s.split('/')[0] : s.child || s.id;
      if (child === lastBest) {
        return skillId(s);
      }
    }
  }
  return skillId(skills[0]);
}

function skillId(s) {
  if (typeof s === 'string') {
    // "research/wrote×17" or full id
    if (s.indexOf('__') >= 0) return s.split(/[·\s]/)[0];
    var parts = s.split('/');
    if (parts.length >= 2) {
      var did = parts[1].replace(/×\d+$/, '').replace(/×.*/, '');
      return parts[0] + '__' + did;
    }
    return s.slice(0, 28);
  }
  if (s.id) return String(s.id).slice(0, 28);
  if (s.child && s.did_prefix) return String(s.child + '__' + s.did_prefix).slice(0, 28);
  return String(s.child || s.id || '?').slice(0, 28);
}

function clip(s) {
  return String(s || '').slice(0, 96);
}

/**
 * Structured forecast for handoff packs (not hop0 line).
 */
function forecastStruct(opts) {
  opts = opts || {};
  var line = densestForecast(opts);
  var tool = null;
  var skill = null;
  var page = null;
  var best = null;
  var parent = null;
  var m;
  if ((m = line.match(/\b(living_[a-z_]+)\b/))) tool = m[1];
  if ((m = line.match(/\bskill:([^\s·]+)/))) skill = m[1];
  if ((m = line.match(/\bpage:([^\s·]+)/))) page = m[1];
  if ((m = line.match(/\bBest\s+([a-z0-9_]+)/i))) best = m[1];
  if ((m = line.match(/\bparent=([a-z0-9_]+)/i))) parent = m[1];
  return {
    line: line,
    tool: tool,
    skill: skill,
    page: page,
    best: best,
    parent: parent || opts.parent || opts.here || 'host'
  };
}

module.exports = {
  densestForecast: densestForecast,
  forecastStruct: forecastStruct
};
