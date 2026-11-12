// Run: node tests/next.test.js   (v2.57: the next visit: where it stands, repeats, reminders)
const assert = require('node:assert/strict');
const U = require('../js/util.js');
require('../js/logic.js');
const N = require('../js/nextvisit.js');
const R = require('../js/reminders.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const NOW = new Date(2026, 10, 11, 9, 0); // Wed, Nov 11 2026
const d = (n) => U.toDateStr(U.addDays(NOW, n));
const visit = (n) => ({ type: 'visit', at: U.addDays(NOW, n).toISOString() });

test('where it stands: none, today, upcoming, passed; a visit on or after the date means it was done', () => {
  assert.equal(N.of({}, [], NOW).state, 'none');
  assert.equal(N.of({ snoozedUntil: d(0) }, [], NOW).state, 'today');
  assert.equal(N.of({ snoozedUntil: d(3), nextTime: '10:30' }, [], NOW).state, 'upcoming');
  assert.equal(N.of({ snoozedUntil: d(-3) }, [visit(-5)], NOW).state, 'passed');
  assert.equal(N.of({ snoozedUntil: d(-3) }, [visit(-2)], NOW).state, 'none');
});
test('the words: Today / Tomorrow / a day, with the time', () => {
  assert.equal(N.whenText(d(0), '10:30', NOW), 'Today · 10:30 AM');
  assert.equal(N.whenText(d(1), null, NOW), 'Tomorrow');
  assert.equal(N.whenText(d(3), '18:00', NOW), 'Sat, Nov 14 · 6:00 PM');
});
test('repeats step a week, two weeks or a month on, and the next one is after today', () => {
  assert.equal(N.step('2026-11-12', 'w1'), '2026-11-19');
  assert.equal(N.step('2026-11-12', 'w2'), '2026-11-26');
  assert.equal(N.step('2026-01-31', 'm1'), '2026-02-28');
  assert.equal(N.following({ snoozedUntil: d(-1), nextRepeat: 'w1' }, NOW), d(6));
  assert.equal(N.following({ snoozedUntil: d(-15), nextRepeat: 'w1' }, NOW), d(6));
  assert.equal(N.following({ snoozedUntil: d(-1) }, NOW), null);
});
test('timed reminders: before the time, the day before at 6 PM, or none; the morning list keeps the rest', () => {
  assert.equal(N.remindAt({ snoozedUntil: '2026-11-14', nextTime: '10:30', nextRemind: '30' }), '2026-11-14T10:00');
  assert.equal(N.remindAt({ snoozedUntil: '2026-11-14', nextTime: '00:15', nextRemind: '60' }), '2026-11-13T23:15');
  assert.equal(N.remindAt({ snoozedUntil: '2026-11-14', nextRemind: 'daybefore' }), '2026-11-13T18:00');
  assert.equal(N.remindAt({ snoozedUntil: '2026-11-14', nextTime: '10:30' }), null);           // the morning list
  assert.equal(N.remindAt({ snoozedUntil: '2026-11-14', nextRemind: '30' }), null);            // no time: the morning list
  assert.equal(N.remindAt({ snoozedUntil: '2026-11-14', nextTime: '10:30', nextRemind: 'none' }), null);
  assert.equal(N.inMorning({ snoozedUntil: '2026-11-14', nextTime: '10:30', nextRemind: 'none' }), false);
  assert.equal(N.inMorning({ snoozedUntil: '2026-11-14' }), true);
});
test('the app sends timed moments from now on and leaves those contacts off the morning list', () => {
  const it = (id, rv) => ({ rv: Object.assign({ id, name: id }, rv), entries: [], att: { state: 'ok' } });
  const items = [it('a', { snoozedUntil: d(3), nextTime: '10:30', nextRemind: '30' }), it('b', { snoozedUntil: d(3) }),
    it('c', { snoozedUntil: d(5), nextRemind: 'daybefore' }), it('old', { snoozedUntil: d(-1), nextTime: '10:00', nextRemind: 'at' })];
  assert.deepEqual(R.atsToSend(items, NOW), [d(3) + 'T10:00', d(4) + 'T18:00']);
  assert.deepEqual(R.datesToSend(items, NOW), [d(3)]);
});
test('fields: the morning list is the default and is not stored; no date clears everything', () => {
  assert.deepEqual(N.fields({ date: d(3), time: '10:30', remind: 'morning', repeat: 'w1' }), { snoozedUntil: d(3), nextTime: '10:30', nextRemind: null, nextRepeat: 'w1' });
  assert.deepEqual(N.fields({}), { snoozedUntil: null, nextTime: null, nextRemind: null, nextRepeat: null });
});
console.log(passed + ' passed');
