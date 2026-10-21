// Run: node tests/logic.test.js
const assert = require('node:assert/strict');
const U = require('../js/util.js');
const D = require('../js/defaults.js');
const L = require('../js/logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}

const S = D.defaultSettings();
// these tests were written against the earlier 7/7/14-day thresholds; pin them
S.defaultStaleDays = 14;
S.stages.forEach((st) => { if (st.id === 'initial' || st.id === 'cultivating') st.days = 7; if (st.id === 'return') st.days = 14; });
S.useNextVisit = true; // next-visit dates were removed from the app in 2.8; the logic still works when switched on
const NOW = new Date(2026, 9, 15, 9, 0); // Thu 15 Oct 2026, 09:00
const at = (y, mo, d, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
const daysAgo = (n) => new Date(2026, 9, 15 - n, 12, 0).toISOString();
let seq = 0;
const mkRv = (o = {}) => Object.assign({
  id: 'rv' + ++seq, name: 'Test ' + seq, address: '', neighborhood: '', phone: '', howMet: '', bestTimes: [], bestNote: '',
  notes: '', interests: '', scriptures: [], tags: [], custom: {}, stage: 'return', archiveReason: null, prevStage: null,
  nextVisit: null, snoozedUntil: null, nhBannerOff: false, createdAt: daysAgo(100), stageChangedAt: daysAgo(100), updatedAt: daysAgo(100), deletedAt: null,
}, o);
const mkEntry = (rvId, type, atIso, text = '') => ({ id: 'e' + ++seq, rvId, type, at: atIso, text, scriptures: [], deletedAt: null });
const item = (rv, entries = []) => L.buildItems([rv], entries, S, NOW)[0];

console.log('thresholds');
test('stage thresholds, default, never, closed', () => {
  assert.equal(L.thresholdFor(S, mkRv({ stage: 'yet' })), 14);
  assert.equal(L.thresholdFor(S, mkRv({ stage: 'initial' })), 7);
  assert.equal(L.thresholdFor(S, mkRv({ stage: 'study' })), 30);
  assert.equal(L.thresholdFor(S, mkRv({ stage: 'archived' })), null);
  const s2 = D.defaultSettings(); s2.stages[3].days = 0;
  assert.equal(L.thresholdFor(s2, mkRv({ stage: 'return' })), null);
});

console.log('attention');
test('stale by recency: ok, soon, overdue', () => {
  const rv = mkRv({ stage: 'return' }); // 14 days, heads-up 2
  assert.equal(item(rv, [mkEntry(rv.id, 'visit', daysAgo(10))]).att.state, 'ok');
  const soon = item(rv, [mkEntry(rv.id, 'visit', daysAgo(13))]).att;
  assert.equal(soon.state, 'soon'); assert.equal(soon.inDays, 1);
  const due = item(rv, [mkEntry(rv.id, 'visit', daysAgo(14))]).att;
  assert.equal(due.state, 'overdue'); assert.equal(due.overdueBy, 0);
  const over = item(rv, [mkEntry(rv.id, 'nh', daysAgo(20))]).att;
  assert.equal(over.state, 'overdue'); assert.equal(over.overdueBy, 6);
});
test('newest entry wins, deleted entries ignored, falls back to created date', () => {
  const rv = mkRv({ createdAt: daysAgo(40) });
  const e1 = mkEntry(rv.id, 'visit', daysAgo(30));
  const e2 = mkEntry(rv.id, 'nh', daysAgo(2));
  assert.equal(item(rv, [e1, e2]).att.daysSince, 2);
  e2.deletedAt = daysAgo(1);
  assert.equal(item(rv, [e1, e2]).att.daysSince, 30);
  assert.equal(item(rv, []).att.daysSince, 40);
});
test('next visit dates are ignored unless switched on (removed from the app)', () => {
  const s2 = D.defaultSettings();
  const p = mkRv({ nextVisit: U.toDateStr(U.addDays(NOW, 90)) });
  assert.equal(L.buildItems([p], [mkEntry(p.id, 'visit', daysAgo(60))], s2, NOW)[0].att.state, 'overdue');
});
test('next visit date overrides recency', () => {
  const far = mkRv({ nextVisit: U.toDateStr(U.addDays(NOW, 90)) });
  assert.equal(item(far, [mkEntry(far.id, 'visit', daysAgo(60))]).att.state, 'ok');
  const past = mkRv({ nextVisit: U.toDateStr(U.addDays(NOW, -1)) });
  const a = item(past, [mkEntry(past.id, 'visit', daysAgo(1))]).att;
  assert.equal(a.state, 'overdue'); assert.equal(a.reason, 'visit'); assert.equal(a.overdueBy, 1);
  const near = mkRv({ nextVisit: U.toDateStr(U.addDays(NOW, 3)) });
  assert.equal(item(near).att.state, 'soon');
  const today = mkRv({ nextVisit: U.toDateStr(NOW) });
  const t = item(today).att; assert.equal(t.state, 'soon'); assert.equal(t.inDays, 0);
});
test('snooze suppresses flags until the day after', () => {
  const rv = mkRv({ snoozedUntil: U.toDateStr(U.addDays(NOW, 5)) });
  assert.equal(item(rv, [mkEntry(rv.id, 'visit', daysAgo(50))]).att.state, 'snoozed');
  const expired = mkRv({ snoozedUntil: U.toDateStr(U.addDays(NOW, -1)) });
  assert.equal(item(expired, [mkEntry(expired.id, 'visit', daysAgo(50))]).att.state, 'overdue');
});
test('closed records are never flagged', () => {
  const rv = mkRv({ stage: 'archived', archiveReason: 'moved' });
  assert.equal(item(rv).att.state, 'closed');
});
test('attention text', () => {
  assert.match(L.attentionText({ state: 'overdue', reason: 'stale', overdueBy: 6 }), /6 days/);
  assert.match(L.attentionText({ state: 'soon', reason: 'visit', inDays: 1 }), /tomorrow/);
});

console.log('not-home pattern');
const thuMorning = (d, h = 9, mi = 30) => at(2026, 10, d, h, mi);
test('shows after two not-homes on the same weekday', () => {
  const rv = mkRv();
  const es = [mkEntry(rv.id, 'nh', thuMorning(8)), mkEntry(rv.id, 'nh', at(2026, 10, 1, 18))]; // Thursday morning and Thursday evening
  const p = L.notHomePattern(item(rv, es), S, NOW);
  assert.ok(p); assert.equal(p.scope, 'day'); assert.equal(p.nh, 2); assert.equal(p.label, 'Thursdays');
});
test('not enough tries, a visit on that weekday, or other weekdays: no banner', () => {
  const rv = mkRv();
  assert.equal(L.notHomePattern(item(rv, [mkEntry(rv.id, 'nh', thuMorning(8))]), S, NOW), null);
  const withVisit = [mkEntry(rv.id, 'nh', thuMorning(8)), mkEntry(rv.id, 'nh', thuMorning(1)), mkEntry(rv.id, 'visit', at(2026, 9, 24, 18))]; // home on a Thursday once
  assert.equal(L.notHomePattern(item(rv, withVisit), S, NOW), null);
  const otherDays = [mkEntry(rv.id, 'nh', at(2026, 10, 12, 9)), mkEntry(rv.id, 'nh', at(2026, 10, 13, 9)), mkEntry(rv.id, 'nh', at(2026, 10, 14, 9))];
  assert.equal(L.notHomePattern(item(rv, otherDays), S, NOW), null);
});
test('suppressed by per-RV switch and global switch', () => {
  const es = (id) => [mkEntry(id, 'nh', thuMorning(8)), mkEntry(id, 'nh', thuMorning(1))];
  const off = mkRv({ nhBannerOff: true });
  assert.equal(L.notHomePattern(item(off, es(off.id)), S, NOW), null);
  const s2 = D.defaultSettings(); s2.notHomeBanner.on = false;
  const rv = mkRv();
  assert.equal(L.notHomePattern(L.buildItems([rv], es(rv.id), s2, NOW)[0], s2, NOW), null);
});
test('best window handles overnight and every-day windows', () => {
  const rv = mkRv({ bestTimes: [{ days: [], from: '08:30', to: '09:15' }] });
  assert.ok(L.inBestWindow(rv, NOW));
  assert.ok(!L.inBestWindow(rv, new Date(2026, 9, 15, 10, 0)));
  const night = mkRv({ bestTimes: [{ days: [4], from: '22:00', to: '02:00' }] });
  assert.ok(L.inBestWindow(night, new Date(2026, 9, 15, 23, 0)));
  assert.ok(L.inBestWindow(night, new Date(2026, 9, 15, 1, 0)));
});

console.log('likely home now');
test('usually home on this weekday, from history', () => {
  const b = mkRv({ name: 'History' });
  const c = mkRv({ name: 'Never' });
  const es = [mkEntry(b.id, 'visit', thuMorning(8)), mkEntry(b.id, 'visit', at(2026, 10, 1, 19)), mkEntry(c.id, 'nh', thuMorning(8))];
  const out = L.likelyHomeNow(L.buildItems([b, c], es, S, NOW), NOW);
  assert.deepEqual(out.map((o) => o.item.rv.name), ['History']);
  assert.equal(out[0].why, 'Home 2 of 2 Thursdays');
});

console.log('sorting and filtering');
test('neighborhood sort: area, then street, then house number', () => {
  const rvs = [
    mkRv({ name: 'A', neighborhood: 'Oak Park', address: '12 Elm St' }),
    mkRv({ name: 'B', neighborhood: 'Oak Park', address: '9 Oak St' }),
    mkRv({ name: 'C', neighborhood: 'Oak Park', address: '100 Elm St' }),
    mkRv({ name: 'D', neighborhood: 'Alder', address: '5 Zed Rd' }),
    mkRv({ name: 'E', neighborhood: '', address: '1 Aaa St' }),
    mkRv({ name: 'F', neighborhood: 'Oak Park', address: '14 Elm St' }),
  ];
  const sorted = L.buildItems(rvs, [], S, NOW).sort(L.SORTS.neighborhood).map((i) => i.rv.name);
  assert.deepEqual(sorted, ['D', 'A', 'F', 'C', 'B', 'E']);
});
test('attention sort puts most overdue first, then soonest', () => {
  const a = mkRv({ name: 'a' }), b = mkRv({ name: 'b' }), c = mkRv({ name: 'c' }), d = mkRv({ name: 'd' });
  const es = [mkEntry(a.id, 'visit', daysAgo(20)), mkEntry(b.id, 'visit', daysAgo(30)), mkEntry(c.id, 'visit', daysAgo(13)), mkEntry(d.id, 'visit', daysAgo(1))];
  const order = L.buildItems([a, b, c, d], es, S, NOW).sort(L.SORTS.attention).map((i) => i.rv.name);
  assert.deepEqual(order, ['b', 'a', 'c', 'd']);
});
test('search covers name, address, phone digits, notes and visit text; stage chips; archived hidden', () => {
  const a = mkRv({ name: 'Maria Lopez', address: '5 Pine Ave', phone: '(209) 555-0101', stage: 'initial' });
  const b = mkRv({ name: 'Tom', notes: 'has a dog', stage: 'study' });
  const c = mkRv({ name: 'Old Contact', stage: 'archived', archiveReason: 'moved' });
  const es = [mkEntry(b.id, 'visit', daysAgo(2), 'asked about the resurrection')];
  const items = L.buildItems([a, b, c], es, S, NOW);
  const active = new Set(S.stages.filter((s) => !s.closed).map((s) => s.id));
  const f = (q, stages = active) => L.filterItems(items, { stages, q }, S).map((i) => i.rv.name);
  assert.deepEqual(f(''), ['Maria Lopez', 'Tom']);
  assert.deepEqual(f('maria'), ['Maria Lopez']);
  assert.deepEqual(f('5550101'.slice(0, 0) + '555'), ['Maria Lopez']);
  assert.deepEqual(f('pine'), ['Maria Lopez']);
  assert.deepEqual(f('resurrection'), ['Tom']);
  assert.deepEqual(f('dog'), ['Tom']);
  assert.deepEqual(f('old'), []);
  assert.deepEqual(f('', new Set(['archived'])), ['Old Contact']);
  assert.deepEqual(f('', new Set(['study'])), ['Tom']);
});

console.log('duplicates');
test('matches by normalized address and by phone digits, includes archived, skips self', () => {
  const a = mkRv({ id: 'a', address: '123 Main Street', phone: '209-555-0101' });
  const b = mkRv({ id: 'b', address: '500 Oak Ave', stage: 'archived', archiveReason: 'dnc' });
  const rvs = [a, b];
  assert.equal(L.duplicateMatches({ address: '123 main st.' }, rvs).length, 1);
  assert.equal(L.duplicateMatches({ phone: '(209) 555 0101' }, rvs).length, 1);
  assert.equal(L.duplicateMatches({ address: '500 oak avenue' }, rvs)[0].id, 'b');
  assert.equal(L.duplicateMatches({ address: '123 main st' }, rvs, 'a').length, 0);
  assert.equal(L.duplicateMatches({ address: '', phone: '' }, rvs).length, 0);
});
test('DNC detection', () => {
  assert.ok(L.isDNC(S, mkRv({ stage: 'archived', archiveReason: 'dnc' })));
  assert.ok(!L.isDNC(S, mkRv({ stage: 'archived', archiveReason: 'moved' })));
  assert.ok(!L.isDNC(S, mkRv({ stage: 'return', archiveReason: 'dnc' })));
});

console.log('csv');
test('parse quotes, embedded commas, newlines, CRLF, BOM, semicolons', () => {
  const rows = U.parseCSV('﻿Name,Notes\r\n"Smith, Jo","said ""hi""\nsecond line"\r\nPlain,ok\r\n');
  assert.deepEqual(rows, [['Name', 'Notes'], ['Smith, Jo', 'said "hi"\nsecond line'], ['Plain', 'ok']]);
  assert.deepEqual(U.parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});
test('stringify round trip', () => {
  const rows = [['a', 'b,c', 'd"e', 'line\nbreak', ''], ['1', '2', '3', '4', '5']];
  assert.deepEqual(U.parseCSV(U.stringifyCSV(rows)), rows);
});
test('guess mapping and import rows', () => {
  const csv = U.parseCSV('Full Name,Street Address,Area,Cell,Status,Comments,Last Contact,Next Visit\nAna,1 Elm St,North,555-1111,Return Visit,likes gardening,03/04/2026,2026-11-01\n,2 Elm St,,,,,,\nBo,3 Elm St,,,Bogus,,,');
  const map = L.guessMapping(csv[0]);
  assert.equal(map.name, 0); assert.equal(map.address, 1); assert.equal(map.neighborhood, 2); assert.equal(map.phone, 3);
  assert.equal(map.stage, 4); assert.equal(map.notes, 5); assert.equal(map.lastVisit, 6); assert.equal(map.nextVisit, 7);
  const r = L.importRows(csv.slice(1), map, S, 'initial');
  assert.equal(r.rvs.length, 2); assert.equal(r.skipped.length, 1); assert.equal(r.skipped[0].line, 3);
  assert.equal(r.rvs[0].stage, 'return'); assert.equal(r.rvs[1].stage, 'initial');
  assert.equal(r.rvs[0].nextVisit, '2026-11-01'); assert.equal(r.entries.length, 1);
  assert.equal(U.toDateStr(new Date(r.entries[0].at)), '2026-03-04');
});
test('export contains header and stage names', () => {
  const rv = mkRv({ name: 'Zed', stage: 'study', bestTimes: [{ days: [1, 2, 3, 4, 5], from: '17:00', to: '20:00' }] });
  const csv = L.rvsToCsv(item(rv).rv ? [item(rv)] : [], S);
  assert.match(csv, /^Name,Address/);
  assert.match(csv, /Bible Study/);
  assert.match(csv, /Mon-Fri 17:00-20:00/);
});

console.log('day tags and the overdue rule');
const tag = (day, part = 'evening') => ({ day, part });
test('a day-tagged RV waits for its day, but never forever', () => {
  const mon = mkRv({ stage: 'initial', dayPrimary: tag(1) });                       // Thursday now, 7-day threshold
  assert.equal(item(mon, [mkEntry(mon.id, 'visit', daysAgo(10))]).att.state, 'ok');   // stale, wrong day: waits
  assert.equal(item(mon, [mkEntry(mon.id, 'visit', daysAgo(10))]).att.waiting, true);
  const thu = mkRv({ stage: 'initial', dayPrimary: tag(4) });
  assert.equal(item(thu, [mkEntry(thu.id, 'visit', daysAgo(10))]).att.state, 'overdue'); // today is their day
  const second = mkRv({ stage: 'initial', dayPrimary: tag(1), daySecondary: tag(4, 'morning') });
  assert.equal(item(second, [mkEntry(second.id, 'visit', daysAgo(10))]).att.state, 'overdue'); // secondary matches
  assert.equal(item(mon, [mkEntry(mon.id, 'visit', daysAgo(14))]).att.state, 'overdue'); // 2x threshold: safety net
  const none = mkRv({ stage: 'initial' });
  assert.equal(item(none, [mkEntry(none.id, 'visit', daysAgo(10))]).att.state, 'overdue'); // no tag: plain recency
});
test('a planned visit date still overrides day tags', () => {
  const rv = mkRv({ stage: 'initial', dayPrimary: tag(1), nextVisit: U.toDateStr(U.addDays(NOW, -2)) });
  assert.equal(item(rv, [mkEntry(rv.id, 'visit', daysAgo(1))]).att.state, 'overdue');
});
test('tag helpers: validation and labels', () => {
  assert.ok(L.validTag(tag(2))); assert.ok(L.validTag({ day: 0, part: '' }));
  assert.ok(!L.validTag(null)); assert.ok(!L.validTag({ day: 9, part: 'morning' })); assert.ok(!L.validTag({ day: 1, part: 'noon' }));
  assert.equal(L.tagLabel(tag(1, 'morning')), 'Monday'); assert.equal(L.tagLabel({ day: 6, part: '' }), 'Saturday');
  assert.equal(L.tagsLabel({ dayPrimary: tag(5, 'evening'), daySecondary: tag(1, 'morning') }), 'Monday, Friday'); // old records: day kept, time dropped
  assert.deepEqual(L.bestDaysOf({ bestDays: [5, 1, 5, 9] }), [1, 5]);
  assert.deepEqual(L.bestDaysOf({ bestDays: [], dayPrimary: tag(2) }), []); // bestDays wins once set
  assert.equal(L.tagsShort({ bestDays: [2, 4] }), 'Tue · Thu');
});

console.log('today plan and forecast');
test('Today: overdue, scheduled today, tagged for today by part of day; nothing else', () => {
  const t = (name, o) => mkRv(Object.assign({ name, stage: 'return' }, o));
  const a = t('a'), b = t('b', { nextVisit: U.toDateStr(NOW) }), c = t('c', { dayPrimary: tag(4, 'evening') });
  const d = t('d', { dayPrimary: tag(1), daySecondary: tag(4, 'morning') }), e = t('e', { dayPrimary: tag(4) });
  const f = t('f', { dayPrimary: tag(4), nextVisit: U.toDateStr(U.addDays(NOW, 5)) }), g = t('g', { dayPrimary: tag(4) });
  const hh = t('h', { dayPrimary: tag(4), snoozedUntil: U.toDateStr(U.addDays(NOW, 3)) }), i = t('i', { dayPrimary: tag(4), stage: 'archived', archiveReason: 'moved' });
  const j = t('j', { dayPrimary: { day: 4, part: '' } }), k = t('k', { dayPrimary: tag(4, 'morning') });
  const es = [
    mkEntry(a.id, 'visit', daysAgo(30)), mkEntry(b.id, 'visit', daysAgo(1)), mkEntry(c.id, 'visit', daysAgo(2)), mkEntry(d.id, 'visit', daysAgo(3)),
    mkEntry(e.id, 'visit', at(2026, 10, 15, 8)),                    // already visited today: not listed again
    mkEntry(f.id, 'visit', daysAgo(2)), mkEntry(g.id, 'visit', daysAgo(30)), mkEntry(hh.id, 'visit', daysAgo(2)),
    mkEntry(j.id, 'visit', daysAgo(2)), mkEntry(k.id, 'nh', at(2026, 10, 15, 7)),
  ];
  const items = L.buildItems([a, b, c, d, e, f, g, hh, i, j, k], es, S, NOW);
  const plan = L.todayPlan(items, NOW);
  assert.deepEqual(plan.overdue.map((x) => x.rv.name), ['a', 'g']);           // g is stale AND tagged today: shown once, in Overdue
  assert.deepEqual(plan.scheduled.map((x) => x.rv.name), ['b']);
  assert.deepEqual(plan.tagged.map((x) => x.item.rv.name), ['c', 'd', 'j', 'k']); // one list, by name
  assert.equal(plan.tagged.find((x) => x.item.rv.name === 'k').nhToday, true);
});
test('Today: overdue split into good today (best day or usually home now) and other days', () => {
  const t = (name, o) => mkRv(Object.assign({ name, stage: 'return' }, o));
  const a = t('a', { dayPrimary: tag(4, 'evening') }), b = t('b', { dayPrimary: tag(1, 'morning') }), c = t('c'), d = t('d', { daySecondary: tag(4, 'morning') });
  const es = [a, b, d].map((r) => mkEntry(r.id, 'visit', daysAgo(40))).concat([mkEntry(c.id, 'visit', at(2026, 9, 24, 9))]); // c: home on a Thursday morning, 3 weeks ago
  const plan = L.todayPlan(L.buildItems([a, b, c, d], es, S, NOW), NOW);
  assert.deepEqual(plan.goodToday.map((x) => x.item.rv.name), ['a', 'd', 'c']);   // one list, most overdue first
  assert.equal(plan.goodToday.find((x) => x.item.rv.name === 'c').why, 'Home 1 of 1 Thursday');
  assert.equal(plan.goodToday.find((x) => x.item.rv.name === 'a').why, 'Best: Thu');
  assert.deepEqual(plan.otherDays.map((x) => x.rv.name), ['b']);
});
test('best-day filter and short labels', () => {
  const a = mkRv({ name: 'a', dayPrimary: tag(4, 'evening') }), b = mkRv({ name: 'b', daySecondary: tag(2, 'morning') }), c = mkRv({ name: 'c' });
  const items = L.buildItems([a, b, c], [], S, NOW);
  const names = (f) => L.filterItems(items, Object.assign({ now: NOW }, f), S).map((i) => i.rv.name);
  assert.deepEqual(names({ bestDay: 'today' }), ['a']);
  assert.deepEqual(names({ bestDay: '2' }), ['b']);
  assert.deepEqual(names({ bestDay: 'none' }), ['c']);
  assert.deepEqual(names({ bestDay: '' }), ['a', 'b', 'c']);
  assert.equal(L.tagsShort(a), 'Thu');
  assert.equal(L.tagShort({ day: 0, part: '' }), 'Sun');
});
test('old "Record visit" label default is renamed, a custom label is kept', () => {
  assert.equal(D.mergeSettings({ labels: { recordVisit: 'Record visit' } }).labels.recordVisit, 'Record a visit');
  assert.equal(D.mergeSettings({ labels: { recordVisit: 'Log call' } }).labels.recordVisit, 'Log call');
});
test('forecast: next 7 days of planned visits and tagged weekdays', () => {
  const x = mkRv({ name: 'x', nextVisit: '2026-10-17' }), y = mkRv({ name: 'y', dayPrimary: tag(6, 'evening') });
  const z = mkRv({ name: 'z', dayPrimary: tag(6, 'morning') }), w = mkRv({ name: 'w', dayPrimary: tag(6), nextVisit: '2026-10-20' });
  const far = mkRv({ name: 'far', nextVisit: '2026-10-30' }), closed = mkRv({ name: 'cl', stage: 'archived', archiveReason: 'moved', dayPrimary: tag(6) });
  const fc = L.forecast(L.buildItems([x, y, z, w, far, closed], [], S, NOW), NOW, 7);
  assert.deepEqual(fc.map((d) => d.dateStr), ['2026-10-17', '2026-10-20']);   // Saturday, and Tuesday for w's own date
  assert.deepEqual(fc[0].scheduled.map((i) => i.rv.name), ['x']);
  assert.deepEqual(fc[0].tagged.map((t) => t.item.rv.name), ['y', 'z']);
  assert.deepEqual(fc[1].scheduled.map((i) => i.rv.name), ['w']);
});

console.log('campaigns');
const camps = [
  { id: 'c1', title: 'Fall', start: '2026-10-12', end: '2026-11-09' }, { id: 'c2', title: 'Winter', start: '2026-11-10', end: '2026-11-30' },
  { id: 'c3', title: 'Summer', start: '2026-07-01', end: '2026-07-31' }, { id: 'c4', title: 'Draft', start: '', end: '' },
];
test('status, active, next', () => {
  assert.deepEqual(camps.map((c) => L.campaignStatus(c, NOW)), ['active', 'upcoming', 'past', 'undated']);
  assert.equal(L.activeCampaign(camps, NOW).id, 'c1'); assert.equal(L.nextCampaign(camps, NOW).id, 'c2');
  assert.equal(L.activeCampaign(camps, new Date(2026, 11, 25)), null);
  assert.equal(L.activeCampaign(camps, new Date(2026, 10, 9, 23, 0)).id, 'c1'); // last day counts
});
test('only one campaign at a time: overlapping dates are detected', () => {
  assert.equal(L.campaignOverlap(camps, { start: '2026-11-09', end: '2026-11-12' }).id, 'c1');   // touches the last day
  assert.equal(L.campaignOverlap(camps, { start: '2026-11-20', end: '2026-12-10' }).id, 'c2');
  assert.equal(L.campaignOverlap(camps, { start: '2026-12-01', end: '2026-12-10' }), null);
  assert.equal(L.campaignOverlap(camps, { start: '2026-10-01', end: '2026-12-31' }).id, 'c1');   // engulfs others
  assert.equal(L.campaignOverlap(camps, { start: '2026-10-13', end: '2026-11-01' }, 'c1'), null); // editing itself is fine
});
test('quick add fallback note', () => {
  assert.equal(L.quickAddFallback({ title: 'Fall' }, [{ title: 'Hope' }, { title: 'Family' }]), 'Campaign: Fall. Topic: Hope, Family');
  assert.equal(L.quickAddFallback({ title: 'Fall' }, []), 'Campaign: Fall');
  assert.equal(L.quickAddFallback(null, [{ title: 'Hope' }]), 'Topic: Hope');
  assert.equal(L.quickAddFallback(null, []), '');
});

console.log('insights');
test('funnel counts per stage and archived', () => {
  const rvs = [mkRv({ stage: 'initial' }), mkRv({ stage: 'initial' }), mkRv({ stage: 'study' }), mkRv({ stage: 'archived', archiveReason: 'moved' })];
  const f = L.funnel(L.buildItems(rvs, [], S, NOW), S);
  assert.deepEqual(f.rows.map((r) => r.count), [0, 2, 0, 0, 1]); assert.equal(f.archived, 1); assert.equal(f.total, 3);
});
test('effort points: every action counts, not-home too; advances and studies; imports excluded', () => {
  const rv = mkRv({ createdAt: daysAgo(5) }), imp = mkRv({ createdAt: daysAgo(5), imported: true }), old = mkRv({ createdAt: daysAgo(80) });
  const stage = (id, from, to, when) => Object.assign(mkEntry(id, 'stage', when), { from, to });
  const es = [
    mkEntry(rv.id, 'nh', daysAgo(1)), mkEntry(rv.id, 'nh', daysAgo(2)), mkEntry(rv.id, 'visit', daysAgo(3)),
    stage(rv.id, 'initial', 'return', daysAgo(3)),                              // forward: 5
    stage(rv.id, 'return', 'study', daysAgo(2)),                                // forward + a study started
    stage(rv.id, 'study', 'archived', daysAgo(1)),                              // archiving earns nothing
    mkEntry(old.id, 'visit', daysAgo(70)),                                       // outside 60 days
  ];
  const e = L.effortSummary(L.buildItems([rv, imp, old], es, S, NOW), S, NOW);
  assert.equal(e.last7, 2 + 1 + 1 + 3 + 5 + 5);                                  // new RV, 2 NH, visit, 2 advances
  assert.equal(e.lifetime, e.last7 + 2 + 3);                                     // + old RV created 80 days ago + its visit
  assert.deepEqual(e.counts60, { newRvs: 1, visits: 1, nh: 2, advances: 2, studies: 1 });
  assert.equal(e.level, 1 + Math.floor(Math.sqrt(e.lifetime / 20)));
  assert.ok(e.levelPct >= 0 && e.levelPct <= 100);
});
test('worth reconsidering: same slot, repeated not-home, no visit there; suggests something else', () => {
  const mk = (o) => mkRv(o);
  const a = mk({ name: 'a' }), b = mk({ name: 'b', daySecondary: tag(6, 'evening') }), c = mk({ name: 'c' }), d = mk({ name: 'd' }), e = mk({ name: 'e' });
  const nhs = (id) => [mkEntry(id, 'nh', at(2026, 10, 8, 9, 30)), mkEntry(id, 'nh', at(2026, 10, 1, 9, 30)), mkEntry(id, 'nh', at(2026, 9, 24, 10, 0))];
  const es = [].concat(nhs(a.id), nhs(b.id), nhs(c.id), [mkEntry(c.id, 'visit', at(2026, 10, 8, 9, 45))],   // c: a visit in the same slot
    [mkEntry(d.id, 'nh', at(2026, 10, 8, 9)), mkEntry(d.id, 'nh', at(2026, 10, 1, 9))],                          // only two tries
    nhs(e.id), [mkEntry(e.id, 'visit', at(2026, 10, 10, 15))]);                                                  // e was home Saturday afternoon
  const items = L.buildItems([a, b, c, d, e], es, S, NOW);
  const out = L.reconsider(items, S, NOW, new Set());
  const names = out.map((r) => r.item.rv.name).sort();
  assert.deepEqual(names, ['a', 'b', 'e']);                                      // c had a visit in that slot, d too few tries
  const get = (n) => out.find((r) => r.item.rv.name === n);
  assert.equal(get('a').nh, 3); assert.equal(get('a').label, 'Thursday mornings');
  assert.match(get('a').suggest, /^Try a weekday evening/);                       // never tried
  assert.equal(get('b').suggest, 'Try Saturdays.');                      // their other tagged day
  assert.match(get('e').suggest, /found them home on Saturday afternoons/);
  assert.deepEqual(L.reconsider(items, S, NOW, new Set([a.id])).map((r) => r.item.rv.name).includes('a'), false); // additive: skips ids shown elsewhere
});
test('stuck in stage: far longer than the stage timing', () => {
  const a = mkRv({ name: 'a', stage: 'initial', stageChangedAt: daysAgo(25) }), b = mkRv({ name: 'b', stage: 'return', stageChangedAt: daysAgo(30) });
  const c = mkRv({ name: 'c', stage: 'study', stageChangedAt: daysAgo(100) }), d = mkRv({ name: 'd', stage: 'archived', archiveReason: 'moved', stageChangedAt: daysAgo(300) });
  const items = L.buildItems([a, b, c, d], [], S, NOW);
  const out = L.stuckInStage(items, S, NOW, new Set());
  assert.deepEqual(out.map((x) => x.item.rv.name), ['c', 'a']);                  // 100 >= 90, 25 >= 21; b (30 < 42) and archived excluded
  assert.equal(out[1].days, 25);
  assert.deepEqual(L.stuckInStage(items, S, NOW, new Set([c.id])).map((x) => x.item.rv.name), ['a']);
});

console.log('settings migration');
test('old Home cards are dropped, version bumped, new settings added', () => {
  const m = D.mergeSettings({ version: 1, homeCards: [{ id: 'campaign', on: true }, { id: 'starters', on: true }, { id: 'topics', on: false }, { id: 'attention', on: true }, { id: 'quickAdd', on: true }] });
  assert.equal(m.version, 2);
  assert.deepEqual(m.homeCards.map((c) => c.id), ['topics', 'recent', 'likelyHome']); // the New RV card left Home in v2.11
  assert.equal(m.homeCards[0].on, false);
  assert.equal(m.dayTagForceFactor, 2); assert.equal(m.points.nh, 1);
});

console.log('settings merge');
test('merge keeps saved values and adds new defaults', () => {
  const saved = { labels: { rv: 'Contact' }, homeCards: [{ id: 'topics', on: false }], defaultStaleDays: 21 };
  const m = D.mergeSettings(saved);
  assert.equal(m.labels.rv, 'Contact'); assert.equal(m.labels.notHome, 'Not Home');
  assert.equal(m.defaultStaleDays, 21);
  assert.equal(m.homeCards[0].id, 'topics'); assert.equal(m.homeCards[0].on, false);
  assert.equal(m.homeCards.length, D.defaultSettings().homeCards.length);
});

test('study stage is recognised, also on older saved settings', () => {
  const st = D.defaultSettings();
  assert.equal(L.isStudyStage(st, 'study'), true);
  assert.equal(L.isStudyStage(st, 'return'), false);
  assert.equal(L.isStudyStage(st, 'archived'), false);
  const old = D.defaultSettings(); old.stages = old.stages.map((x) => { const y = Object.assign({}, x); delete y.study; return y; });
  assert.equal(L.isStudyStage(old, 'study'), true);
  const csv = L.rvsToCsv([], st);
  assert.ok(csv.includes('Publication') && csv.includes('Where we are'));
});

test('Smile decoder reads shared keys, duplicate keys and long strings', () => {
  const smile = require('../js/smile.js'), ma = require('../js/ma.js');
  // simple object: {"N":"Ann"} then a nested array
  const b2 = Uint8Array.from([0x3a, 0x29, 0x0a, 0x01, 0xfa, 0x80, 0x4e, 0x42, 0x41, 0x6e, 0x6e, 0x81, 0x41, 0x42, 0xf8, 0x23, 0x21, 0xc2, 0xf9, 0xfb]);
  assert.deepEqual(smile.decode(b2), { N: 'Ann', AB: [true, null, 1] });
  assert.deepEqual(smile.decode(b2, { pairs: true })[0], ['N', 'Ann']);
  assert.throws(() => smile.decode(Uint8Array.from([1, 2, 3, 4, 5])), /Not a Smile/);
  const people = [['Pe', [['P', [['N', 'Zed'], ['Add', '1 A St'], ['Zip', '95204'], ['Hidden', false]]]]], ['Pe', [['P', [['N', '']]]]]];
  const r = ma.convert([['PersonMap', people], ['Cities', ['Stockton']]], { uuid: (() => { let i = 0; return () => 'id' + (++i); })(), stageId: 'initial' });
  assert.equal(r.rvs.length, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.rvs[0].address, '1 A St, Stockton 95204');
  assert.throws(() => ma.convert([['X', 1]]), /no people/);
});

test('Ministry Assistant import sets best day from the last visit that was not a not-home', () => {
  const ma = require('../js/ma.js');
  const at2 = (y, m, d, h) => new Date(y, m, d, h, 0, 0).getTime();
  const pi = (text, ms) => ['PI', [['I', text], ['D', ms]]];
  const person = (name, pis) => ['Pe', [['P', [['N', name], ['Inf', pis]]]]];
  const r = ma.convert([['PersonMap', [
    person('A', [pi('Talked about hope', at2(2025, 5, 10, 9)), pi('Not home', at2(2025, 5, 14, 19))]),
    person('B', [pi('NH', at2(2025, 5, 14, 19))]),
    person('C', [pi('Nice chat', at2(2025, 5, 13, 18)), pi('Left tract', at2(2025, 5, 17, 14))]),
  ]]], { uuid: (() => { let i = 0; return () => 'x' + (++i); })(), stageId: 'initial', bestFromLast: true });
  const by = (n) => r.rvs.find((x) => x.name === n);
  assert.deepEqual(by('A').bestDays, [new Date(2025, 5, 10).getDay()]);
  assert.deepEqual(by('B').bestDays, []);
  assert.deepEqual(by('C').bestDays, [new Date(2025, 5, 17).getDay()]);
  const off = ma.convert([['PersonMap', [person('A', [pi('Hi', at2(2025, 5, 10, 9))])]]], { uuid: () => 'y', stageId: 'initial' });
  assert.deepEqual(off.rvs[0].bestDays, []);
});

test('overdue after 30 days by default; old untouched defaults move to 30, hand-set values stay', () => {
  const fresh = D.defaultSettings();
  assert.equal(fresh.defaultStaleDays, 30);
  assert.deepEqual(fresh.stages.filter((s) => !s.closed && s.id !== 'yet').map((s) => s.days), [30, 30, 30, 30]);
  const oldStages = D.defaultSettings().stages.map((s) => Object.assign({}, s, { days: { initial: 7, cultivating: 10, return: 14 }[s.id] ?? s.days }));
  const m = D.mergeSettings({ stages: oldStages, defaultStaleDays: 14 });
  assert.deepEqual(m.stages.filter((s) => ['initial', 'cultivating', 'return'].includes(s.id)).map((s) => s.days), [30, 10, 30]);
  assert.equal(m.defaultStaleDays, 30);
  const again = D.mergeSettings(Object.assign({}, m, { defaultStaleDays: 14 }));
  assert.equal(again.defaultStaleDays, 14); // after the one-time move, a hand-set 14 is kept
});

test('study: suggest the next lesson or paragraph from free text', () => {
  assert.equal(L.suggestNext('Lesson 3'), 'Lesson 4');
  assert.equal(L.suggestNext('Ch. 5 ¶12'), 'Ch. 5 ¶13');
  assert.equal(L.suggestNext('page 40.'), 'page 41.');
  assert.equal(L.suggestNext('Introduction'), '');
  assert.equal(L.suggestNext(''), '');
});

console.log('v2.11-2.12 Today scope and area lists');
test('Today scope: best day today, usually home this weekday, or no best day; not snoozed, closed or seen today', () => {
  const t = (name, o) => mkRv(Object.assign({ name }, o));
  const a = t('a', { bestDays: [4] }), b = t('b', { bestDays: [1] }), c = t('c', { bestDays: [] }), d = t('d', { bestDays: [2] });
  const e = t('e', { bestDays: [4], snoozedUntil: U.toDateStr(U.addDays(NOW, 3)) }), f = t('f', { bestDays: [4], stage: 'archived', archiveReason: 'moved' });
  const g = t('g', { bestDays: [4] });
  const es = [mkEntry(d.id, 'visit', at(2026, 10, 8, 10)), mkEntry(g.id, 'visit', at(2026, 10, 15, 8))]; // d home last Thursday; g seen today
  const items = L.buildItems([a, b, c, d, e, f, g], es, S, NOW);
  assert.deepEqual(L.todaySet(items, NOW).map((i) => i.rv.name).sort(), ['a', 'c', 'd']);
  assert.deepEqual(L.likelyHomeToday(items, NOW).map((i) => i.rv.name).sort(), ['a', 'd']); // no guessing for c
});
test('Longest since visit sort puts the oldest touch first', () => {
  const a = mkRv({ name: 'a' }), b = mkRv({ name: 'b' }), c = mkRv({ name: 'c' });
  const items = L.buildItems([a, b, c], [mkEntry(a.id, 'visit', daysAgo(3)), mkEntry(b.id, 'visit', daysAgo(40)), mkEntry(c.id, 'nh', daysAgo(10))], S, NOW);
  assert.deepEqual(items.slice().sort(L.SORTS.oldest).map((i) => i.rv.name), ['b', 'c', 'a']);
});

test('geotag: street address from an OpenStreetMap reverse lookup', () => {
  const GEO = require('../js/geo.js');
  assert.equal(GEO.streetOf({ house_number: '1415', road: 'N Wilson Way', city: 'Stockton' }), '1415 N Wilson Way');
  assert.equal(GEO.streetOf({ road: 'Pacific Ave' }), 'Pacific Ave');
  assert.equal(GEO.streetOf(null), '');
  assert.equal(GEO.label({ lat: 37.9577, lng: -121.29078, acc: 12 }), '37.95770, -121.29078 (±12 m)');
});
test('geotag: a typed street address gets a missing city and ZIP; the street part is never changed', () => {
  const GEO = require('../js/geo.js');
  const a = { house_number: '1415', road: 'N Wilson Way', city: 'Stockton', postcode: '95205-1234', 'ISO3166-2-lvl4': 'US-CA' };
  assert.equal(GEO.fullOf(a), '1415 N Wilson Way, Stockton, CA 95205');
  assert.equal(GEO.completeAddress('1417 N Wilson Way', a), '1417 N Wilson Way, Stockton, CA 95205');
  assert.equal(GEO.completeAddress('1417 N Wilson Way, Stockton', a), '1417 N Wilson Way, Stockton, CA 95205');
  assert.equal(GEO.completeAddress('1417 N Wilson Way, Stockton, CA', a), '1417 N Wilson Way, Stockton, CA 95205');
  assert.equal(GEO.completeAddress('1417 N Wilson Way 95205', a), '1417 N Wilson Way, Stockton, CA 95205');
  assert.equal(GEO.completeAddress('1417 N Wilson Way, stockton 95207', a), '1417 N Wilson Way, stockton 95207'); // complete: untouched
  assert.equal(GEO.completeAddress('12345 Main St', a), '12345 Main St, Stockton, CA 95205'); // a 5-digit house number is not a ZIP
  assert.equal(GEO.completeAddress('1417 N Wilson Way', { road: 'N Wilson Way', city: 'Stockton' }), '1417 N Wilson Way, Stockton'); // no ZIP found
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', with failures' : ''));
