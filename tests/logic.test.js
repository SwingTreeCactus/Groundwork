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
test('shows after two not-homes in the same weekday and part of day', () => {
  const rv = mkRv();
  const es = [mkEntry(rv.id, 'nh', thuMorning(8)), mkEntry(rv.id, 'nh', thuMorning(1, 10, 15))];
  const p = L.notHomePattern(item(rv, es), S, NOW);
  assert.ok(p); assert.equal(p.scope, 'day'); assert.equal(p.nh, 2); assert.match(p.label, /Thursday mornings/);
});
test('not enough tries, or a recorded visit in the slot, or other times: no banner', () => {
  const rv = mkRv();
  assert.equal(L.notHomePattern(item(rv, [mkEntry(rv.id, 'nh', thuMorning(8))]), S, NOW), null);
  const withVisit = [mkEntry(rv.id, 'nh', thuMorning(8)), mkEntry(rv.id, 'nh', thuMorning(1)), mkEntry(rv.id, 'visit', at(2026, 9, 24, 9, 45))]; // Thu 24 Sep, a visit in the same slot
  assert.equal(L.notHomePattern(item(rv, withVisit), S, NOW), null);
  const evening = [mkEntry(rv.id, 'nh', at(2026, 10, 8, 18)), mkEntry(rv.id, 'nh', at(2026, 10, 1, 18, 30))];
  assert.equal(L.notHomePattern(item(rv, evening), S, NOW), null);
});
test('suppressed by best-time window, per-RV switch, global switch', () => {
  const es = (id) => [mkEntry(id, 'nh', thuMorning(8)), mkEntry(id, 'nh', thuMorning(1))];
  const inWin = mkRv({ bestTimes: [{ days: [4], from: '08:00', to: '11:00' }] });
  assert.equal(L.notHomePattern(item(inWin, es(inWin.id)), S, NOW), null);
  const outWin = mkRv({ bestTimes: [{ days: [4], from: '18:00', to: '20:00' }] });
  assert.ok(L.notHomePattern(item(outWin, es(outWin.id)), S, NOW));
  const off = mkRv({ nhBannerOff: true });
  assert.equal(L.notHomePattern(item(off, es(off.id)), S, NOW), null);
  const s2 = D.defaultSettings(); s2.notHomeBanner.on = false;
  const rv = mkRv();
  assert.equal(L.notHomePattern(L.buildItems([rv], es(rv.id), s2, NOW)[0], s2, NOW), null);
});
test('weekday fallback needs one more try', () => {
  const rv = mkRv();
  // Mon, Tue mornings: not the same weekday as Thursday
  const two = [mkEntry(rv.id, 'nh', at(2026, 10, 12, 9)), mkEntry(rv.id, 'nh', at(2026, 10, 13, 9))];
  assert.equal(L.notHomePattern(item(rv, two), S, NOW), null);
  const three = two.concat(mkEntry(rv.id, 'nh', at(2026, 10, 14, 9)));
  const p = L.notHomePattern(item(rv, three), S, NOW);
  assert.ok(p); assert.equal(p.scope, 'daytype'); assert.match(p.label, /weekday mornings/);
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
test('best window first, then history', () => {
  const a = mkRv({ name: 'Window', bestTimes: [{ days: [4], from: '08:00', to: '10:00' }] });
  const b = mkRv({ name: 'History' });
  const c = mkRv({ name: 'Never' });
  const es = [mkEntry(b.id, 'visit', thuMorning(8)), mkEntry(b.id, 'visit', thuMorning(1)), mkEntry(c.id, 'nh', thuMorning(8))];
  const items = L.buildItems([a, b, c], es, S, NOW);
  const out = L.likelyHomeNow(items, NOW);
  assert.deepEqual(out.map((o) => o.item.rv.name), ['Window', 'History']);
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

console.log('settings merge');
test('merge keeps saved values and adds new defaults', () => {
  const saved = { labels: { rv: 'Contact' }, homeCards: [{ id: 'topics', on: false }], defaultStaleDays: 21 };
  const m = D.mergeSettings(saved);
  assert.equal(m.labels.rv, 'Contact'); assert.equal(m.labels.notHome, 'Not Home');
  assert.equal(m.defaultStaleDays, 21);
  assert.equal(m.homeCards[0].id, 'topics'); assert.equal(m.homeCards[0].on, false);
  assert.equal(m.homeCards.length, D.defaultSettings().homeCards.length);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', with failures' : ''));
