// Run: node tests/service.test.js   (service time and the calendar, v2.53)
const assert = require('node:assert/strict');
globalThis.RV = {};
require('../js/util.js');
const V = require('../js/service.js');

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; } };
const local = (ds, hh) => new Date(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10), hh || 10).toISOString();
const NOW = new Date(2026, 10, 6, 9, 0); // Fri, Nov 6 2026
const rng = (start, end, brk, credit) => ({ mode: 'range', start, end, brk: brk || 0, credit: !!credit });
const tot = (mins, credit) => ({ mode: 'total', mins, credit: !!credit });
let seq = 0;
const T = (date, s) => Object.assign({ id: 't' + ++seq, kind: 'time', date, seq }, s);
const bundle = (o) => Object.assign({ settings: { service: { setup: true, since: local('2026-10-01', 0), profiles: [{ from: '2026-09', kind: 'pioneer' }], aux: {}, pattern: {}, overrides: {}, cleared: {} } }, times: [], months: [], entries: [], rvs: [] }, o);

test('session minutes: a range minus its break, a total as given', () => {
  assert.equal(V.sessionMins(rng('09:30', '12:00', 15)), 135);
  assert.equal(V.sessionMins(tot(90)), 90);
  assert.equal(V.fmtDur(135), '2 h 15 m'); assert.equal(V.fmtDur(45), '45 m'); assert.equal(V.fmtDur(180), '3 h');
});
test('overlapping sessions count the shared minutes once; the earlier session keeps them', () => {
  const t = V.dayTotals([rng('09:30', '12:00', 15), rng('11:45', '13:00')]);
  assert.equal(t.total, 195); assert.equal(t.overlap, 15);
  assert.equal(t.per[1].overlapFrom, '11:45'); assert.equal(t.per[1].overlapTo, '12:00');
  const c = V.dayTotals([rng('09:00', '11:00'), rng('10:00', '12:00', 0, true)]);
  assert.equal(c.ministry, 120); assert.equal(c.credit, 60);
  const fixed = V.fixOverlap([rng('09:30', '12:00'), rng('11:45', '13:00')], 1);
  assert.equal(fixed.start, '12:00');
});
test('a day is capped at 24 hours', () => {
  const t = V.dayTotals([tot(20 * 60), tot(6 * 60)]);
  assert.equal(t.total, 24 * 60); assert.ok(t.tooLong);
});
test('profiles: newest set on or before a month; past months keep theirs; auxiliary months on a publisher base', () => {
  const s = { profiles: [{ from: '2026-09', kind: 'publisher', track: false }, { from: '2026-11', kind: 'pioneer' }], aux: { '2026-10': 30 } };
  assert.equal(V.profileFor(s, '2026-09').kind, 'publisher');
  const oct = V.profileFor(s, '2026-10'); assert.equal(oct.kind, 'aux'); assert.equal(V.goalOf(oct), 30); assert.ok(V.tracks(oct));
  assert.equal(V.profileFor(s, '2026-12').kind, 'pioneer'); assert.equal(V.goalOf(V.profileFor(s, '2026-12')), 50);
  assert.equal(V.goalOf({ kind: 'caux' }), 30); assert.equal(V.goalOf({ kind: 'other', goal: 100 }), 100);
  assert.equal(V.tracks({ kind: 'publisher', track: false }), false); assert.equal(V.tracks({ kind: 'publisher', track: true }), true);
  assert.equal(V.badge(oct, '2026-10'), 'Auxiliary · Oct');
});
test('month totals round down and carry the leftover minutes; service and credit carry separately', () => {
  const D = bundle({ times: [T('2026-10-03', tot(2 * 60 + 45)), T('2026-10-10', tot(4 * 60 + 30, true)), T('2026-11-01', tot(4 * 60 + 30))], months: [{ month: '2026-10', adjMins: 60 * 60 }] });
  const oct = V.monthStats(D, '2026-10');
  assert.equal(oct.hours, 62); assert.equal(oct.credit, 4); assert.equal(oct.outS, 45); assert.equal(oct.outC, 30);
  const nov = V.monthStats(D, '2026-11');
  assert.equal(nov.carryS, 45); assert.equal(nov.carryC, 30); assert.equal(nov.shown, 4 * 60 + 30 + 45 + 30); assert.equal(nov.hours, 5);
});
test('a month total typed in (adjustment) counts on top of day sessions', () => {
  const D = bundle({ months: [{ month: '2026-09', adjMins: 58 * 60, adjCredit: 0 }] });
  assert.equal(V.monthStats(D, '2026-09').hours, 58);
});
test('the plan: weekly pattern, every other week, chosen weeks, and a day changed on the calendar', () => {
  const svc = { pattern: { 6: [Object.assign(rng('09:00', '12:00'), { repeat: 'every' }), Object.assign(rng('13:00', '15:00'), { repeat: 'other', anchor: '2026-11-07' })], 3: [Object.assign(tot(120), { repeat: 'weeks', weeks: [1, 3] })] }, overrides: { '2026-11-14': [] } };
  assert.equal(V.planMins(svc, '2026-11-07'), 300);
  assert.equal(V.planMins(svc, '2026-11-14'), 0, 'changed on the calendar to nothing');
  assert.equal(V.planMins(svc, '2026-11-21'), 300, 'every other week');
  assert.equal(V.planMins(svc, '2026-11-28'), 180);
  assert.equal(V.planMins(svc, '2026-11-04'), 120, '1st Wednesday'); assert.equal(V.planMins(svc, '2026-11-11'), 0); assert.equal(V.planMins(svc, '2026-11-18'), 120);
});
test('pace: recorded plus the rest of the plan; today counts the larger of recorded and planned', () => {
  const D = bundle({ times: [T('2026-11-02', tot(180)), T('2026-11-06', tot(60))] });
  D.settings.service.pattern = { 5: [Object.assign(tot(120), { repeat: 'every' })] }; // Fridays 2 h: Nov 6, 13, 20, 27
  assert.equal(V.pace(D, '2026-11', NOW), 180 + 120 + 3 * 120);
  assert.equal(V.pace(D, '2026-10', NOW), V.monthStats(D, '2026-10').shown, 'a past month is what was recorded');
});
test('rings: live activity with no time, from the day tracking began; cleared and timed days drop off', () => {
  const rvs = [{ id: 'a', name: 'Maria Lopez', createdAt: local('2026-09-01') , imported: true }, { id: 'b', name: 'James Carter', createdAt: local('2026-11-05', 10) }];
  const entries = [
    { id: 'e1', rvId: 'a', type: 'visit', at: local('2026-11-03') },
    { id: 'e2', rvId: 'a', type: 'nh', at: local('2026-11-04') },
    { id: 'e3', rvId: 'a', type: 'visit', at: local('2026-11-02'), imported: true },
    { id: 'e4', rvId: 'a', type: 'visit', at: local('2026-09-15') },
  ];
  const D = bundle({ rvs, entries, times: [T('2026-11-04', tot(60))] });
  D.settings.service.cleared = {};
  assert.deepEqual(V.ringDays(D, '2026-11', NOW), ['2026-11-03', '2026-11-05'], 'Nov 3 visit, Nov 5 new contact; Nov 4 has time; Nov 2 was imported');
  D.settings.service.cleared = { '2026-11-03': true };
  assert.deepEqual(V.ringDays(D, '2026-11', NOW), ['2026-11-05']);
  assert.deepEqual(V.ringDays(D, '2026-09', NOW), [], 'two months back: never');
  D.settings.service.profiles = [{ from: '2026-09', kind: 'publisher', track: false }];
  assert.deepEqual(V.ringDays(D, '2026-11', NOW), [], 'no rings when time is not kept');
});
test('last month keeps its rings until its report is ticked Sent', () => {
  const rvs = [{ id: 'a', name: 'Maria', createdAt: local('2026-09-01'), imported: true }];
  const D = bundle({ rvs, entries: [{ id: 'e', rvId: 'a', type: 'visit', at: local('2026-10-31') }] });
  assert.deepEqual(V.ringDays(D, '2026-10', NOW), ['2026-10-31']);
  D.months = [{ month: '2026-10', sent: true }];
  assert.deepEqual(V.ringDays(D, '2026-10', NOW), []);
});
test('a new contact recorded with its first conversation is one line, "New contact"', () => {
  const rvs = [{ id: 'b', name: 'James Carter', createdAt: local('2026-11-05', 10) }];
  const entries = [{ id: 'e', rvId: 'b', type: 'visit', at: new Date(new Date(local('2026-11-05', 10)).getTime() + 30000).toISOString() }];
  const a = V.activity(bundle({ rvs, entries }), { live: true }).get('2026-11-05');
  assert.equal(a.length, 1); assert.equal(a[0].kind, 'new');
});
test('reminder dates: the day after a day with activity and no time', () => {
  const rvs = [{ id: 'a', name: 'Maria', createdAt: local('2026-09-01'), imported: true }];
  const D = bundle({ rvs, entries: [{ id: 'e', rvId: 'a', type: 'visit', at: local('2026-11-05') }, { id: 'f', rvId: 'a', type: 'visit', at: local('2026-11-06', 8) }] });
  assert.deepEqual(V.remindDates(D, NOW), ['2026-11-06', '2026-11-07']);
  D.times = [T('2026-11-05', tot(60))];
  assert.deepEqual(V.remindDates(D, NOW), ['2026-11-07'], 'time recorded for yesterday: only tomorrow');
});
test('studies: everyone with a study session; under three in all shows which study; adjustment added', () => {
  const rvs = ['Mario', 'Ana', 'José'].map((n, i) => ({ id: 's' + i, name: n }));
  const st = (rv, ds) => ({ id: rv + ds, rvId: rv, type: 'visit', study: true, at: local(ds) });
  const entries = [st('s0', '2026-09-02'), st('s0', '2026-10-02'), st('s0', '2026-11-02'), st('s1', '2026-11-03'), st('s2', '2026-10-20'), st('s2', '2026-11-04'),
    { id: 'x', rvId: 's1', type: 'visit', at: local('2026-11-05') }];
  const D = bundle({ rvs, entries, months: [{ month: '2026-11', adjStudies: 1 }] });
  const s = V.studies(D, '2026-11');
  assert.equal(s.count, 4);
  assert.deepEqual(s.people.map((p) => [p.name, p.nth]), [['Ana', 1], ['José', 2], ['Mario', null]]);
});
test('report text: pioneers report hours and credit; publishers report that they shared', () => {
  const rvs = [{ id: 'a', name: 'Maria', createdAt: local('2026-09-01'), imported: true }];
  const D = bundle({ rvs, entries: [{ id: 'e', rvId: 'a', type: 'visit', study: true, at: local('2026-10-05') }], times: [T('2026-10-05', tot(2 * 60 + 10)), T('2026-10-06', tot(4 * 60, true))], months: [{ month: '2026-10', comments: 'Assembly weekend', adjMins: 60 * 60 }] });
  assert.equal(V.reportText(D, '2026-10'), 'October 2026 report\nHours: 62\nCredit: 4\nBible studies: 1\nComments: Assembly weekend');
  D.settings.service.profiles = [{ from: '2026-09', kind: 'publisher', track: true }];
  assert.equal(V.reportText(D, '2026-10'), 'October 2026 report\nShared in the ministry: Yes\nBible studies: 1\nComments: Assembly weekend');
});
test('the service year runs September to August, with a pace from the plan', () => {
  const D = bundle({ times: [T('2026-11-02', tot(11 * 60))], months: [{ month: '2026-09', adjMins: 58 * 60 }, { month: '2026-10', adjMins: 62 * 60 }] });
  D.settings.service.pattern = { 6: [Object.assign(tot(120), { repeat: 'every' })] };
  const y = V.yearOf(D, '2026-11', NOW);
  assert.equal(y.label, '2026–27'); assert.equal(y.mins, 131 * 60); assert.equal(y.avgMins, 60 * 60); assert.equal(y.goalH, 600);
  assert.ok(y.paceMins > y.mins);
  assert.equal(V.yearStart('2027-03'), '2026-09'); assert.equal(V.yearStart('2026-09'), '2026-09');
});

// ---------- v2.54: the year view and the year in review ----------
test('year months: recorded, the plan ahead, which months have days, credit and the carry', () => {
  const D = bundle({ times: [T('2026-10-03', tot(125)), T('2026-10-10', tot(60, true)), T('2026-11-02', tot(90))],
    months: [{ id: 'svm-2026-09', kind: 'svmonth', month: '2026-09', adjMins: 3600, adjCredit: 0 }] });
  D.settings.service.pattern = { 6: [{ mode: 'total', mins: 180 }] };
  const y = V.yearMonths(D, '2026-11', NOW);
  assert.equal(y.months.length, 12);
  assert.equal(y.months[0].m, '2026-09'); assert.equal(y.months[0].rec, 3600); assert.equal(y.months[0].hasDays, false);
  assert.equal(y.months[1].rec, 185); assert.equal(y.months[1].hasDays, true);
  assert.equal(y.months[2].cur, true); assert.ok(y.months[2].plan > 0, 'the rest of November is planned');
  assert.equal(y.months[3].rec, 0); assert.ok(y.months[3].plan >= 4 * 180, 'December from My schedule');
  assert.equal(y.credit, 60);
  assert.equal(y.carry, 5, 'October’s 3 h 5 m carries 5 minutes (September was whole hours)');
});
test('year in review: hours, days out, best weekday, people, new, studies and firsts, topic, area, growth', () => {
  const rvs = [
    { id: 'a', name: 'Ana', neighborhood: 'Lakeview', createdAt: local('2026-10-01') },
    { id: 'b', name: 'Ben', neighborhood: 'Lakeview', createdAt: local('2025-05-01') },
    { id: 'c', name: 'Cal', neighborhood: 'Oak Park', createdAt: local('2026-12-01'), imported: true },
  ];
  const sat = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24'];
  const entries = [
    ...sat.map((d, i) => ({ id: 'v' + i, rvId: 'a', type: 'visit', at: local(d), topic: 'top1' })),
    { id: 'w1', rvId: 'b', type: 'visit', at: local('2026-10-06'), study: true },
    { id: 'w0', rvId: 'b', type: 'visit', at: local('2026-03-06'), study: true }, // a study before the year: not a first
    { id: 'w2', rvId: 'a', type: 'visit', at: local('2026-11-07'), study: true },
    { id: 'n1', rvId: 'c', type: 'nh', at: local('2026-12-05') },
    { id: 'g1', rvId: 'a', type: 'stage', at: local('2026-10-24'), grew: true },
    { id: 'old', rvId: 'b', type: 'visit', at: local('2026-08-30') }, // last service year
  ];
  const D = bundle({ rvs, entries, times: [T('2026-10-03', tot(600)), T('2027-08-20', tot(60))], months: [{ id: 'svm-2026-09', kind: 'svmonth', month: '2026-09', adjMins: 36000 }] });
  const R = V.yearReview(D, '2026-09');
  assert.equal(R.label, '2026–27');
  assert.equal(R.hours, 611); assert.equal(R.tracked, true); assert.equal(R.goalReached, 600);
  assert.equal(R.daysOut, 8); // four Saturdays, Oct 6, Nov 7, Dec 5, Aug 20 (time only)
  assert.equal(R.topDay.day, 6); assert.equal(R.topDay.n, 6); // Nov 7 and Dec 5 2026 are Saturdays too
  assert.equal(R.people, 2, 'a Not Home is not a conversation');
  assert.equal(R.fresh, 1, 'Ana was new; Cal was imported');
  assert.equal(R.studies, 2); assert.equal(R.firstStudies, 1);
  assert.equal(R.topic.key, 'top1'); assert.equal(R.topic.n, 4);
  assert.equal(R.area.key, 'Lakeview');
  assert.equal(R.grew, 1); assert.equal(R.any, true);
});
test('year in review: the goal is mentioned only when reached; a quiet year still has its numbers', () => {
  const D = bundle({ months: [{ id: 'svm-2026-09', kind: 'svmonth', month: '2026-09', adjMins: 3000 }] });
  const R = V.yearReview(D, '2026-09');
  assert.equal(R.hours, 50); assert.equal(R.goalReached, null); assert.equal(R.topDay, null); assert.equal(R.area, null);
  const E = V.yearReview(bundle({}), '2026-09');
  assert.equal(E.any, false);
});

console.log(passed + ' passed');
