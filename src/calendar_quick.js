/**
 * P53 densest calendar quick-add parse (Fantastical-lite).
 * Law: schedule patterns only · amount always 0 · never invent $
 *
 * Examples densest:
 *   Focus weekdays 10
 *   Errands sat 11
 *   Recovery sunday 14
 *   Dentist tue 9
 *   Gym daily 7
 *   Deep work mon,wed,fri 15-17
 */
'use strict';

var DOW_NAME = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

function slugify(name) {
  return (
    String(name || 'action')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'action'
  );
}

/**
 * Parse one densest quick-add line → schedule-only action draft.
 */
function parseQuickAdd(line, opts) {
  opts = opts || {};
  var raw = String(line || '').trim();
  if (!raw) return { ok: false, error: 'empty' };
  if (raw.length > 200) raw = raw.slice(0, 200);

  var lower = raw.toLowerCase();
  var cadence = 'weekly';
  var days = null;
  var nDays = null;
  var hours = [10];
  var allDay = false;
  var spanHours = 1;

  // all day
  if (/\ball\s*day\b/.test(lower) || /\ballday\b/.test(lower)) {
    allDay = true;
    hours = ['all'];
  }

  // weekdays / daily / every N days
  if (/\bweekdays?\b/.test(lower) || /\bm-?f\b/.test(lower)) {
    cadence = 'weekdays';
    days = [1, 2, 3, 4, 5];
  } else if (/\bdaily\b/.test(lower) || /\bevery\s*day\b/.test(lower)) {
    cadence = 'daily';
    days = null;
  } else {
    var everyM = lower.match(/\bevery\s+(\d+)\s*days?\b/);
    if (everyM) {
      cadence = 'every_n_days';
      nDays = parseInt(everyM[1], 10) || 2;
    }
  }

  // explicit days mon,wed,fri or mon wed fri
  var dayHits = [];
  Object.keys(DOW_NAME).forEach(function (k) {
    var re = new RegExp('\\b' + k + '\\b', 'i');
    if (re.test(lower)) dayHits.push(DOW_NAME[k]);
  });
  // dedupe preserve order
  if (dayHits.length) {
    var seen = Object.create(null);
    days = [];
    dayHits.forEach(function (d) {
      if (seen[d]) return;
      seen[d] = 1;
      days.push(d);
    });
    if (cadence === 'weekly' || !/\bweekdays?\b|\bdaily\b/.test(lower)) {
      cadence = days.length === 5 && [1, 2, 3, 4, 5].every(function (x) {
        return days.indexOf(x) >= 0;
      })
        ? 'weekdays'
        : 'weekly';
    }
  }

  // hours: 10, 9-11, 15:00, @10
  var hm = lower.match(/(?:@\s*)?(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::\d{2})?/);
  if (hm && !allDay) {
    var h0 = parseInt(hm[1], 10);
    var h1 = parseInt(hm[3], 10);
    if (h0 >= 0 && h0 <= 23) {
      hours = [h0];
      if (h1 > h0 && h1 <= 23) spanHours = h1 - h0;
    }
  } else {
    var hm2 = lower.match(/(?:@\s*|at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (hm2 && !allDay) {
      var h = parseInt(hm2[1], 10);
      var ap = hm2[3];
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      if (h >= 0 && h <= 23) hours = [h];
    }
  }

  // name: strip known tokens densest
  var name = raw
    .replace(/\b(weekdays?|m-?f|daily|every\s+day|every\s+\d+\s*days?|all\s*day|allday)\b/gi, ' ')
    .replace(
      /\b(sun(day)?|mon(day)?|tue(s|sday)?|wed(nesday)?|thu(r|rsday)?|fri(day)?|sat(urday)?)\b/gi,
      ' '
    )
    .replace(/(?:@\s*|at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?(?:\s*-\s*\d{1,2}(?::\d{2})?)?/gi, ' ')
    .replace(/[,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) name = 'Schedule block';

  var id = 'act_' + slugify(name);
  var act = {
    id: id,
    name: name.slice(0, 80),
    kind: 'schedule',
    polarity: 'neutral',
    amountMonthly: 0,
    scheduleOnly: true,
    section: 'SCHEDULE',
    cadence: cadence,
    hours: allDay ? ['all'] : hours,
    allDay: allDay,
    enabled: true,
    author: opts.author || 'review_sot-quick',
    note: 'quick-add densest · $0 · never invent money',
    at: new Date().toISOString()
  };
  if (days) act.days = days;
  if (nDays) act.nDays = nDays;
  if (spanHours > 1 && !allDay) act.spanHours = spanHours;

  return {
    ok: true,
    action: act,
    raw: raw,
    law: 'quick-add schedule only · amountMonthly=0'
  };
}

module.exports = {
  parseQuickAdd: parseQuickAdd,
  slugify: slugify
};
