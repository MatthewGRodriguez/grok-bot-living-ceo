/**
 * P55 densest free/busy (Reclaim-lite).
 * Busy = work block hours + scheduled custom actions for that weekday.
 * Law: display/planning only · never invent $ · no auto-reschedule.
 */
'use strict';

var fs = require('fs');
var path = require('path');

function readJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) { /* */ }
  return fallback;
}

function loadProfile(rankingRoot) {
  return readJson(path.join(rankingRoot, 'joys', 'calendar_profile.json'), {
    work: { enabled: true, days: [1, 2, 3, 4, 5], startHour: 15, endHour: 23 },
    customActions: []
  });
}

function loadActions(rankingRoot) {
  var cat = readJson(path.join(rankingRoot, 'joys', 'calendar_actions.json'), {
    actions: []
  });
  return Array.isArray(cat.actions) ? cat.actions : [];
}

function isWorkDay(dow, work) {
  if (!work || work.enabled === false) return false;
  var days = work.days || [1, 2, 3, 4, 5];
  return days.indexOf(dow) >= 0;
}

function isWorkHour(hour, work) {
  if (!work || work.enabled === false) return false;
  var a = Number(work.startHour);
  var b = Number(work.endHour);
  if (!isFinite(a)) a = 15;
  if (!isFinite(b)) b = 23;
  return hour >= a && hour < b;
}

/**
 * Does action occur on this weekday (0=Sun..6=Sat)? densest cadence only.
 */
function actionOnDow(a, dow) {
  if (!a || a.enabled === false) return false;
  var cad = String(a.cadence || 'weekly').toLowerCase();
  if (cad === 'daily' || cad === 'always') return true;
  if (cad === 'weekdays') return dow >= 1 && dow <= 5;
  if (cad === 'selected') return true; // paint densest — treat as possible
  if (Array.isArray(a.days) && a.days.length) {
    return a.days.indexOf(dow) >= 0;
  }
  if (cad === 'weekly') return true; // unknown days → soft busy candidate
  if (cad === 'monthly' || cad === 'yearly' || cad === 'every_n_days') {
    return true; // densest: mark template busy hour if defined
  }
  return false;
}

function actionHours(a) {
  if (!a) return [];
  if (a.allDay || (Array.isArray(a.hours) && a.hours[0] === 'all')) {
    var all = [];
    for (var h = 0; h < 24; h++) all.push(h);
    return all;
  }
  if (Array.isArray(a.hours)) {
    return a.hours
      .map(function (x) {
        return parseInt(x, 10);
      })
      .filter(function (n) {
        return isFinite(n) && n >= 0 && n <= 23;
      });
  }
  return [];
}

/**
 * Build free/busy for one weekday template (0–6).
 * opts: { date: 'YYYY-MM-DD' optional for label only }
 */
function freeBusyForDow(rankingRoot, dow, opts) {
  opts = opts || {};
  rankingRoot =
    rankingRoot || path.resolve(__dirname, '..', '..', 'legacy', 'legacy', 'html');
  dow = parseInt(dow, 10);
  if (!isFinite(dow) || dow < 0 || dow > 6) dow = new Date().getDay();

  var profile = loadProfile(rankingRoot);
  var work = profile.work || {};
  var actions = loadActions(rankingRoot).concat(profile.customActions || []);

  var hours = [];
  var busyN = 0;
  for (var h = 0; h < 24; h++) {
    var reasons = [];
    if (isWorkDay(dow, work) && isWorkHour(h, work)) {
      reasons.push({
        kind: 'work',
        id: 'work',
        name: work.label || 'Work',
        scheduleOnly: true
      });
    }
    actions.forEach(function (a) {
      if (!actionOnDow(a, dow)) return;
      if (a.kind === 'work') return; // work block already from profile
      var hs = actionHours(a);
      if (hs.indexOf(h) < 0) return;
      reasons.push({
        kind: a.kind || 'schedule',
        id: a.id || a.name,
        name: a.name || a.id,
        scheduleOnly: !!(a.scheduleOnly || !(Number(a.amountMonthly || a.amount) > 0))
      });
    });
    var busy = reasons.length > 0;
    if (busy) busyN++;
    hours.push({
      hour: h,
      busy: busy,
      free: !busy,
      reasons: reasons,
      label: (h < 10 ? '0' : '') + h + ':00'
    });
  }

  var freeHours = hours.filter(function (x) {
    return x.free;
  }).map(function (x) {
    return x.hour;
  });
  var busyHours = hours.filter(function (x) {
    return x.busy;
  }).map(function (x) {
    return x.hour;
  });

  return {
    ok: true,
    dow: dow,
    dow_name: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow],
    date: opts.date || null,
    work: {
      enabled: work.enabled !== false,
      days: work.days || [1, 2, 3, 4, 5],
      startHour: Number(work.startHour) || 15,
      endHour: Number(work.endHour) || 23,
      label: work.label || 'Work'
    },
    hours: hours,
    free_hours: freeHours,
    busy_hours: busyHours,
    free_n: freeHours.length,
    busy_n: busyN,
    densest_line:
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow] +
      ' free=' +
      freeHours.length +
      'h busy=' +
      busyN +
      'h work=' +
      (work.startHour || 15) +
      '–' +
      (work.endHour || 23),
    law: 'free/busy densest · work+schedule · never invent $ · no auto-reschedule'
  };
}

/**
 * Week template Mon–Sun densest lines.
 */
function freeBusyWeek(rankingRoot, opts) {
  opts = opts || {};
  var days = [];
  for (var d = 0; d < 7; d++) {
    days.push(freeBusyForDow(rankingRoot, d, opts));
  }
  return {
    ok: true,
    days: days,
    densest: days.map(function (x) {
      return x.densest_line;
    }),
    law: 'week free/busy densest · planning only'
  };
}

/**
 * Optional VFREEBUSY densest text (not full ICS calendar).
 */
function freeBusyVfb(rankingRoot, dow, opts) {
  var fb = freeBusyForDow(rankingRoot, dow, opts);
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//living-core//freebusy//EN',
    'BEGIN:VFREEBUSY',
    'UID:freebusy-dow' + fb.dow + '@living-core',
    'SUMMARY:living free/busy ' + fb.dow_name,
    'COMMENT:work+schedule densest · money not in freebusy'
  ];
  // densest: one FREEBUSY per busy hour as floating template date
  var ymd = opts.template_ymd || '20260804';
  fb.hours.forEach(function (h) {
    if (!h.busy) return;
    var a = ymd + 'T' + (h.hour < 10 ? '0' : '') + h.hour + '0000';
    var bH = h.hour + 1;
    if (bH > 23) bH = 23;
    var b = ymd + 'T' + (bH < 10 ? '0' : '') + bH + '0000';
    lines.push('FREEBUSY;FBTYPE=BUSY:' + a + '/' + b);
  });
  lines.push('END:VFREEBUSY', 'END:VCALENDAR');
  return {
    ok: true,
    text: lines.join('\r\n') + '\r\n',
    free_busy: fb,
    law: fb.law
  };
}

module.exports = {
  freeBusyForDow: freeBusyForDow,
  freeBusyWeek: freeBusyWeek,
  freeBusyVfb: freeBusyVfb,
  loadProfile: loadProfile,
  loadActions: loadActions
};
