/**
 * P51 densest ICS export for review_sot calendar_actions.
 * Law: schedule time blocks only · never invent $ from ICS · sheet remains money SoT.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function escapeText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line) {
  // ICS line fold at 75 octets densest-simple (ASCII)
  if (line.length <= 74) return line;
  var out = [];
  var i = 0;
  out.push(line.slice(0, 74));
  i = 74;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 73));
    i += 73;
  }
  return out.join('\r\n');
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Floating local DTSTART densest (no TZ farm) from hour + template date. */
function dtStart(hour, allDay, templateYmd) {
  var y = templateYmd || '20260804';
  if (allDay) return y;
  var h = parseInt(hour, 10);
  if (!isFinite(h)) h = 10;
  if (h < 0) h = 0;
  if (h > 23) h = 23;
  return y + 'T' + pad2(h) + '0000';
}

function dtEnd(hour, allDay, templateYmd, spanHours) {
  if (allDay) {
    // exclusive end day densest: next calendar day
    return nextYmd(templateYmd || '20260804');
  }
  var h = parseInt(hour, 10);
  if (!isFinite(h)) h = 10;
  var span = spanHours != null ? Number(spanHours) : 1;
  if (!isFinite(span) || span < 1) span = 1;
  var endH = h + span;
  if (endH > 23) endH = 23;
  var y = templateYmd || '20260804';
  return y + 'T' + pad2(endH) + '0000';
}

function nextYmd(ymd) {
  var y = parseInt(ymd.slice(0, 4), 10);
  var m = parseInt(ymd.slice(4, 6), 10) - 1;
  var d = parseInt(ymd.slice(6, 8), 10);
  var dt = new Date(Date.UTC(y, m, d + 1));
  return (
    dt.getUTCFullYear() +
    pad2(dt.getUTCMonth() + 1) +
    pad2(dt.getUTCDate())
  );
}

function byDay(days) {
  if (!Array.isArray(days) || !days.length) return null;
  return days
    .map(function (d) {
      var n = parseInt(d, 10);
      if (!isFinite(n) || n < 0 || n > 6) return null;
      return DOW[n];
    })
    .filter(Boolean)
    .join(',');
}

/**
 * densest RRULE from cadence / days / nDays.
 */
function rruleForAction(a) {
  var cad = String(a.cadence || 'weekly').toLowerCase();
  var days = a.days;
  if (cad === 'weekdays') days = [1, 2, 3, 4, 5];
  if (cad === 'always' || cad === 'daily') {
    return 'FREQ=DAILY';
  }
  if (cad === 'every_n_days' && a.nDays) {
    return 'FREQ=DAILY;INTERVAL=' + Math.max(1, parseInt(a.nDays, 10) || 1);
  }
  if (cad === 'monthly') {
    var dom = a.day != null ? parseInt(a.day, 10) : 1;
    if (!isFinite(dom) || dom < 1) dom = 1;
    return 'FREQ=MONTHLY;BYMONTHDAY=' + dom;
  }
  if (cad === 'yearly') {
    var mon = a.month != null ? parseInt(a.month, 10) : 6;
    var dy = a.day != null ? parseInt(a.day, 10) : 15;
    if (!isFinite(mon) || mon < 1) mon = 6;
    if (!isFinite(dy) || dy < 1) dy = 15;
    return 'FREQ=YEARLY;BYMONTH=' + mon + ';BYMONTHDAY=' + dy;
  }
  // weekly / some_days / selected densest → BYDAY
  var bd = byDay(days);
  if (bd) return 'FREQ=WEEKLY;BYDAY=' + bd;
  if (cad === 'weekly') return 'FREQ=WEEKLY;BYDAY=MO,WE,FR';
  return 'FREQ=WEEKLY;BYDAY=MO';
}

function isAllDay(a) {
  if (a.allDay) return true;
  if (Array.isArray(a.hours) && (a.hours[0] === 'all' || a.hours.indexOf('all') >= 0)) return true;
  if (String(a.cadence || '').toLowerCase() === 'always') return true;
  return false;
}

function primaryHour(a) {
  if (isAllDay(a)) return 0;
  if (Array.isArray(a.hours) && a.hours.length) {
    var h = parseInt(a.hours[0], 10);
    return isFinite(h) ? h : 10;
  }
  return 10;
}

function uidFor(a) {
  return (a.id || a.name || 'act') + '@living-core.review_sot';
}

/**
 * One VEVENT densest. Money never as VALARM amount — DESCRIPTION only.
 */
function veventLines(a, opts) {
  opts = opts || {};
  var ymd = opts.template_ymd || '20260804';
  var allDay = isAllDay(a);
  var hour = primaryHour(a);
  var span =
    a.kind === 'work' && a.hours && a.hours.length >= 2
      ? Math.max(1, (parseInt(a.hours[a.hours.length - 1], 10) || 23) - hour)
      : a.spanHours || 1;
  var start = dtStart(hour, allDay, ymd);
  var end = dtEnd(hour, allDay, ymd, span);
  var amt = Number(a.amountMonthly != null ? a.amountMonthly : a.amount) || 0;
  var descParts = [
    a.note || '',
    'kind=' + (a.kind || 'schedule'),
    'cadence=' + (a.cadence || ''),
    amt > 0
      ? 'money SoT = review_sot sheet (not ICS) · amountMonthly ref only ' + amt
      : 'schedule only · $0 · never invent money',
    'living-core densest ICS export'
  ].filter(Boolean);

  var lines = ['BEGIN:VEVENT'];
  lines.push('UID:' + escapeText(uidFor(a)));
  lines.push('SUMMARY:' + escapeText(a.name || a.id || 'action'));
  if (allDay) {
    lines.push('DTSTART;VALUE=DATE:' + start);
    lines.push('DTEND;VALUE=DATE:' + end);
  } else {
    lines.push('DTSTART:' + start);
    lines.push('DTEND:' + end);
  }
  var rr = rruleForAction(a);
  if (rr) lines.push('RRULE:' + rr);
  lines.push('DESCRIPTION:' + escapeText(descParts.join(' · ')));
  lines.push('CATEGORIES:' + escapeText((a.section || 'SCHEDULE') + ',' + (a.kind || 'schedule')));
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Build full ICS text from action list.
 */
function buildIcs(actions, opts) {
  opts = opts || {};
  var body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//living-core//review_sot//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeText(opts.calname || 'living-core schedule'),
    'X-LIVING-LAW:schedule only · money SoT sheet · never invent $'
  ];
  var n = 0;
  (actions || []).forEach(function (a) {
    if (!a || a.enabled === false) return;
    // densest: skip pure money customs without schedule hours? still export time if hours set
    veventLines(a, opts).forEach(function (line) {
      body.push(line);
    });
    n++;
  });
  body.push('END:VCALENDAR');
  var text = body.map(foldLine).join('\r\n') + '\r\n';
  return { ok: true, text: text, events_n: n, law: 'ICS = schedule · $ not SoT' };
}

/**
 * Export densest ICS file under review_sot or living-core exports.
 */
function exportIcs(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot = rankingRoot || path.resolve(__dirname, '..', '..', 'legacy', 'legacy', 'html');
  var file = path.join(rankingRoot, 'joys', 'calendar_actions.json');
  var actions = [];
  if (fs.existsSync(file)) {
    try {
      var raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      actions = raw.actions || raw || [];
      if (!Array.isArray(actions)) actions = [];
    } catch (_e) {
      return { ok: false, error: 'bad_calendar_actions' };
    }
  }
  var built = buildIcs(actions, opts);
  if (!built.ok) return built;

  var outRel = opts.path || 'joys/calendar_export.ics';
  var outAbs = path.isAbsolute(outRel) ? outRel : path.join(rankingRoot, outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, built.text, 'utf8');

  // optional living-core exports mirror densest
  var livingExports = opts.living_root
    ? path.join(opts.living_root, 'store', 'exports', 'living_calendar_export.ics')
    : null;
  if (livingExports) {
    try {
      fs.mkdirSync(path.dirname(livingExports), { recursive: true });
      fs.writeFileSync(livingExports, built.text, 'utf8');
    } catch (_m) { /* */ }
  }

  return {
    ok: true,
    path: outAbs,
    living_export: livingExports,
    events_n: built.events_n,
    bytes: Buffer.byteLength(built.text, 'utf8'),
    law: built.law,
    note: 'Google/Apple can import for display · money stays review_sot sheet'
  };
}

/**
 * Unfold ICS folded lines (space/tab continuation).
 */
function unfoldIcs(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');
}

function parseProps(block) {
  var props = Object.create(null);
  String(block || '')
    .split('\n')
    .forEach(function (line) {
      line = line.trim();
      if (!line || line.indexOf(':') < 0) return;
      var i = line.indexOf(':');
      var keyPart = line.slice(0, i);
      var val = line.slice(i + 1);
      var key = keyPart.split(';')[0].toUpperCase();
      // unescape densest
      val = val
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
      props[key] = val;
      props[key + '_raw'] = keyPart;
    });
  return props;
}

function hourFromDtstart(dt, keyRaw) {
  if (!dt) return { hour: 10, allDay: false };
  if (/VALUE=DATE/i.test(keyRaw || '') || /^\d{8}$/.test(dt)) {
    return { hour: 0, allDay: true };
  }
  // 20260804T100000 or with Z
  var m = String(dt).match(/T(\d{2})/);
  if (m) return { hour: parseInt(m[1], 10), allDay: false };
  return { hour: 10, allDay: false };
}

function daysFromRrule(rrule) {
  if (!rrule) return { cadence: 'weekly', days: [1, 3, 5] };
  var u = String(rrule).toUpperCase();
  if (u.indexOf('FREQ=DAILY') >= 0) {
    var intM = u.match(/INTERVAL=(\d+)/);
    if (intM && parseInt(intM[1], 10) > 1) {
      return { cadence: 'every_n_days', nDays: parseInt(intM[1], 10), days: null };
    }
    return { cadence: 'daily', days: null };
  }
  if (u.indexOf('FREQ=MONTHLY') >= 0) {
    var md = u.match(/BYMONTHDAY=(\d+)/);
    return { cadence: 'monthly', day: md ? parseInt(md[1], 10) : 1, days: null };
  }
  if (u.indexOf('FREQ=YEARLY') >= 0) {
    var bm = u.match(/BYMONTH=(\d+)/);
    var bd = u.match(/BYMONTHDAY=(\d+)/);
    return {
      cadence: 'yearly',
      month: bm ? parseInt(bm[1], 10) : 6,
      day: bd ? parseInt(bd[1], 10) : 15,
      days: null
    };
  }
  // BYDAY
  var by = u.match(/BYDAY=([A-Z,]+)/);
  if (by) {
    var map = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    var days = by[1]
      .split(',')
      .map(function (x) {
        return map[x.trim()];
      })
      .filter(function (n) {
        return n != null;
      });
    var weekdays =
      days.length === 5 &&
      [1, 2, 3, 4, 5].every(function (d) {
        return days.indexOf(d) >= 0;
      });
    if (weekdays) return { cadence: 'weekdays', days: [1, 2, 3, 4, 5] };
    return { cadence: 'weekly', days: days.length ? days : [1, 3, 5] };
  }
  return { cadence: 'weekly', days: [1, 3, 5] };
}

function slugifyName(name) {
  return String(name || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'event';
}

/**
 * Parse ICS text → densest action drafts (always scheduleOnly · amount 0).
 * Never invent money from DESCRIPTION.
 */
function parseIcs(text, opts) {
  opts = opts || {};
  var unfolded = unfoldIcs(text);
  var blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  var drafts = [];
  var skipped = [];
  blocks.forEach(function (chunk, idx) {
    var end = chunk.indexOf('END:VEVENT');
    var body = end >= 0 ? chunk.slice(0, end) : chunk;
    var p = parseProps(body);
    var summary = p.SUMMARY || p.summary;
    if (!summary) {
      skipped.push({ i: idx, reason: 'no_summary' });
      return;
    }
    // densest refuse money invent: never set amount from ICS
    var ht = hourFromDtstart(p.DTSTART, p.DTSTART_raw);
    var rr = daysFromRrule(p.RRULE);
    var idBase = slugifyName(summary);
    var id = 'act_' + idBase;
    // prefer stable act_* from living export UIDs; ignore tiny random UIDs
    if (p.UID) {
      var uidSlug = slugifyName(String(p.UID).split('@')[0]);
      if (uidSlug && uidSlug.length >= 4 && uidSlug !== 'event') {
        id = 'act_' + uidSlug.replace(/^act_/, '');
      }
    }
    var note = (p.DESCRIPTION || '').slice(0, 200);
    // strip money-looking $ amounts from note densest? keep text but force amount 0
    drafts.push({
      id: id,
      name: summary.slice(0, 80),
      kind: 'schedule',
      polarity: 'neutral',
      amountMonthly: 0,
      scheduleOnly: true,
      section: 'SCHEDULE',
      cadence: rr.cadence,
      days: rr.days,
      nDays: rr.nDays,
      day: rr.day,
      month: rr.month,
      hours: ht.allDay ? ['all'] : [ht.hour],
      allDay: ht.allDay,
      note: (note ? note + ' · ' : '') + 'imported ICS schedule-only · $0 · never invent money',
      enabled: true,
      author: opts.author || 'living-core-ics-import',
      from_ics: true
    });
  });
  return {
    ok: true,
    drafts: drafts,
    skipped: skipped,
    events_n: drafts.length,
    law: 'import schedule only · amountMonthly forced 0 · sheet $ untouched'
  };
}

/**
 * Import ICS file → calendar_actions.json (merge densest).
 * opts: { path|text, apply=false dry default, force overwrite same id }
 */
function importIcs(rankingRoot, opts) {
  opts = opts || {};
  rankingRoot =
    rankingRoot || path.resolve(__dirname, '..', '..', 'legacy', 'legacy', 'html');
  var text = opts.text || '';
  if (!text && opts.path) {
    var p = path.isAbsolute(opts.path)
      ? opts.path
      : path.join(rankingRoot, opts.path);
    if (!fs.existsSync(p)) return { ok: false, error: 'ics_not_found', path: p };
    text = fs.readFileSync(p, 'utf8');
  }
  if (!text) return { ok: false, error: 'text_or_path required' };

  var parsed = parseIcs(text, opts);
  if (!parsed.drafts.length) {
    return {
      ok: true,
      applied: false,
      imported_n: 0,
      drafts: [],
      skipped: parsed.skipped,
      note: 'no VEVENT summaries'
    };
  }

  if (opts.apply !== true) {
    return {
      ok: true,
      applied: false,
      dry_run: true,
      imported_n: 0,
      would_import: parsed.drafts.length,
      drafts: parsed.drafts,
      skipped: parsed.skipped,
      law: parsed.law,
      note: 'dry_run — set apply=true to write calendar_actions.json'
    };
  }

  var file = path.join(rankingRoot, 'joys', 'calendar_actions.json');
  var catalog = { project: 'review_sot', law: 'ICS import schedule-only', actions: [], updated_at: null };
  if (fs.existsSync(file)) {
    try {
      catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_e) { /* */ }
  }
  if (!Array.isArray(catalog.actions)) catalog.actions = [];
  var byId = Object.create(null);
  catalog.actions.forEach(function (a) {
    if (a && a.id) byId[a.id] = a;
  });
  var written = [];
  var skippedExist = [];
  // densest name dedupe: same scheduleOnly name → reuse existing id unless force
  var byName = Object.create(null);
  catalog.actions.forEach(function (a) {
    if (!a || !a.name) return;
    var k = String(a.name).toLowerCase();
    if (a.scheduleOnly || Number(a.amountMonthly || a.amount || 0) === 0) {
      byName[k] = a.id;
    }
  });

  parsed.drafts.forEach(function (d) {
    // force money law
    d.amountMonthly = 0;
    d.scheduleOnly = true;
    d.kind = d.kind || 'schedule';
    d.polarity = 'neutral';
    var nameKey = String(d.name || '').toLowerCase();
    if (!opts.force && byName[nameKey] && byName[nameKey] !== d.id) {
      // merge onto existing id densest
      d.id = byName[nameKey];
    }
    if (byId[d.id] && !opts.force) {
      skippedExist.push(d.id);
      return;
    }
    byId[d.id] = d;
    byName[nameKey] = d.id;
    written.push(d.id);
  });
  catalog.actions = Object.keys(byId).map(function (k) {
    return byId[k];
  });
  catalog.updated_at = new Date().toISOString();
  catalog.law = 'ICS import densest · schedule only · never invent $';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

  return {
    ok: true,
    applied: true,
    path: file,
    imported_n: written.length,
    written: written,
    skipped_exist: skippedExist,
    skipped_parse: parsed.skipped,
    actions_n: catalog.actions.length,
    law: parsed.law,
    note: 'calendar_actions updated · sheet money untouched · Save review_sot if UI open'
  };
}

module.exports = {
  buildIcs: buildIcs,
  exportIcs: exportIcs,
  importIcs: importIcs,
  parseIcs: parseIcs,
  veventLines: veventLines,
  rruleForAction: rruleForAction
};
