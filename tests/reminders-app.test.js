// Run: node tests/reminders-app.test.js   (the app side of follow-up reminders, v2.52)
const assert = require('node:assert/strict');
const U = require('../js/util.js');
require('../js/logic.js');
const R = require('../js/reminders.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const NOW = new Date(2026, 10, 4, 7, 30);
const d = (n) => U.toDateStr(U.addDays(NOW, n));
const it = (name, snoozedUntil, entries, state) => ({ rv: { id: name, name, snoozedUntil }, entries: entries || [], att: { state: state || 'ok' } });

test('only follow-up dates from today on, once each, for open contacts', () => {
  const items = [it('Maria Lopez', d(0)), it('James Carter', d(3)), it('Linda Nguyen', d(3)), it('Old', d(-2)), it('Gone', d(5), [], 'closed'), it('None', null)];
  assert.deepEqual(R.datesToSend(items, NOW), [d(0), d(3)]);
});
test("today drops off once everyone due today has had a visit or Not Home today", () => {
  const today = new Date(2026, 10, 4, 7, 0).toISOString();
  const a = it('Maria Lopez', d(0), [{ type: 'nh', at: today }]), b = it('Ben', d(0));
  assert.deepEqual(R.datesToSend([a, b], NOW), [d(0)]);
  b.entries.push({ type: 'visit', at: today });
  assert.deepEqual(R.datesToSend([a, b], NOW), []);
});
test('the words: one name in full, two names, then first names', () => {
  assert.deepEqual(R.message(['Maria Lopez']), { title: 'Follow-up today', body: 'Maria Lopez' });
  assert.deepEqual(R.message(['Maria Lopez', 'James Carter']), { title: 'Follow-ups today', body: 'Maria Lopez and James Carter' });
  assert.deepEqual(R.message(['Maria Lopez', 'James Carter', 'Linda Nguyen']), { title: '3 follow-ups today', body: 'Maria, James and Linda' });
  assert.equal(R.message([]).title, 'Follow-ups today');
});
test('the service worker uses the same words', () => {
  const sw = require('fs').readFileSync(require('path').join(__dirname, '../sw.js'), 'utf8');
  const fn = new Function(sw.slice(sw.indexOf('function reminderText'), sw.indexOf("self.addEventListener('push'")) + '; return reminderText;')();
  for (const n of [[], ['A B'], ['A B', 'C D'], ['A B', 'C D', 'E F', 'G H']]) assert.deepEqual(fn(n), R.message(n));
});
console.log(passed + ' passed');
