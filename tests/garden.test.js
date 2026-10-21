// Run: node tests/garden.test.js   (garden logic, v2.16; spec claude/garden-plan.md)
const assert = require('node:assert/strict');
const U = require('../js/util.js');
const D = require('../js/defaults.js');
require('../js/logic.js');
const G = require('../js/garden.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const S = D.defaultSettings(); // 30-day windows, heads-up 2 days
const NOW = new Date(2026, 9, 21, 12, 0); // Wed 21 Oct 2026, noon
const ago = (n, h = 12) => new Date(2026, 9, 21 - n, h, 0).toISOString();
const ahead = (n) => U.toDateStr(U.addDays(NOW, n));
let seq = 0;
const rv = (o = {}) => Object.assign({ id: 'r' + ++seq, name: 'T' + seq, stage: 'initial', createdAt: ago(200), stageChangedAt: ago(200), whatsNext: '', snoozedUntil: null }, o);
const v = (r, n, x = {}) => Object.assign({ id: 'e' + ++seq, rvId: r.id, type: 'visit', at: ago(n), text: 'chat' }, x);
const nh = (r, n) => ({ id: 'e' + ++seq, rvId: r.id, type: 'nh', at: ago(n) });

console.log('forms and counts');
test('stages map to the five forms; archived has none', () => {
  assert.deepEqual(['yet', 'initial', 'cultivating', 'return', 'study', 'archived'].map((s) => G.formOf(S, s)), [1, 2, 3, 4, 5, 0]);
});
test('steps to grow: Potential 1 conversation, Initial 2-chain, Cultivating 3-chain, Return Visit 3 studies; editable', () => {
  assert.deepEqual(['yet', 'initial', 'cultivating', 'return', 'study'].map((s) => G.needFor(S, s)), [1, 2, 3, 3, 0]);
  assert.deepEqual(['yet', 'initial', 'cultivating', 'return', 'study'].map((s) => G.kindFor(S, s)), ['first', 'chain', 'chain', 'study', 'none']);
  const s2 = D.defaultSettings(); s2.stages.find((s) => s.id === 'cultivating').grow = 5;
  assert.equal(G.needFor(s2, 'cultivating'), 5);
});

console.log('conversation chain');
test('conversations within the gap build the chain; Not Homes and a second visit the same day do not count', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(60) });
  const es = [v(r, 50), v(r, 50, { at: ago(50, 18) }), nh(r, 40), v(r, 25), v(r, 3)];
  assert.equal(G.chain(r, es, S, NOW).count, 3);
});
test('a gap longer than the window restarts the run at the next conversation', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(120) });
  const es = [v(r, 110), v(r, 90), v(r, 40), v(r, 20)]; // 90 -> 40 is 50 days
  assert.equal(G.chain(r, es, S, NOW).count, 2);
});
test('the first link must come within the gap of reaching the stage', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(100) });
  assert.equal(G.chain(r, [v(r, 50), v(r, 30)], S, NOW).count, 2); // 50 days late: the run starts at it
  assert.equal(G.chain(r, [v(r, 80), v(r, 60)], S, NOW).count, 0); // last link 60 days ago: broken
});
test('when the gap passes the bar empties; the form stays', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(70) });
  const c = G.chain(r, [v(r, 65), v(r, 45), v(r, 31)], S, NOW);
  assert.equal(c.broken, true); assert.equal(c.count, 0);
  assert.equal(G.formOf(S, r.stage), 3);
});
test('the bar fades in the last heads-up days before it would break', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(70) });
  assert.equal(G.chain(r, [v(r, 28)], S, NOW).fading, true);   // 2 days left
  assert.equal(G.chain(r, [v(r, 20)], S, NOW).fading, false);
});
test('only visits after the stage was reached count; imported visits never count toward growth', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(10) });
  assert.equal(G.chain(r, [v(r, 15), v(r, 5)], S, NOW).count, 1);
  assert.equal(G.chain(r, [v(r, 5, { imported: true })], S, NOW).count, 0);
});
test('the chain gap follows the stage window when it is changed in Settings', () => {
  const s2 = D.defaultSettings(); s2.stages.find((s) => s.id === 'cultivating').days = 10;
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(40) });
  assert.equal(G.chain(r, [v(r, 30), v(r, 15)], s2, NOW).broken, true);
  assert.equal(G.chain(r, [v(r, 30), v(r, 15)], S, NOW).count, 2);
});

console.log('Follow up on <date>');
test('a follow-up date holds the chain past the gap, through the date plus the heads-up grace', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(90), snoozedUntil: ahead(5) });
  const c = G.chain(r, [v(r, 60), v(r, 40)], S, NOW); // 40 days since the last link
  assert.equal(c.broken, false); assert.equal(c.held, true); assert.equal(c.count, 2); assert.equal(c.fading, false);
  const late = rv({ stage: 'cultivating', stageChangedAt: ago(90), snoozedUntil: U.toDateStr(U.addDays(NOW, -3)) });
  assert.equal(G.chain(late, [v(late, 60), v(late, 40)], S, NOW).broken, true); // date + 2 days grace has passed
});
test('a visit made while held counts as a link, and stays counted after the date is cleared', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(90), snoozedUntil: ahead(1) });
  const es = [v(r, 60), v(r, 41)];
  assert.equal(G.heldLink(r, es, S, NOW.toISOString()), true);
  es.push(v(r, 0, { at: NOW.toISOString(), chainHeld: true }));
  const cleared = Object.assign({}, r, { snoozedUntil: null });
  assert.equal(G.chain(cleared, es, S, NOW).count, 3);
  assert.equal(G.heldLink(rv({ stage: 'cultivating', stageChangedAt: ago(90) }), [v(r, 10)], S, NOW.toISOString()), false);
});
test('a follow-up date keeps the plant from turning thirsty before it', () => {
  const r = rv({ stage: 'return', snoozedUntil: ahead(4) });
  assert.equal(G.care(r, [v(r, 40, { plan: true })], S, NOW), G.CARE.HEALTHY);
  const r2 = rv({ stage: 'return' });
  assert.equal(G.care(r2, [v(r2, 40, { plan: true })], S, NOW), G.CARE.DRY);
});

console.log('growth');
test('created as Potential: the next conversation grows it to Initial Call', () => {
  const r = rv({ stage: 'yet', createdAt: ago(5), stageChangedAt: ago(5) });
  assert.equal(G.growth(r, [], S, NOW), null);
  assert.equal(G.growth(r, [v(r, 0)], S, NOW), 'initial');
});
test('created as Initial Call: the creation conversation is link 1, one more within the gap grows it', () => {
  const created = ago(20);
  const r = rv({ stage: 'initial', createdAt: created, stageChangedAt: created, garden: { since: new Date(new Date(created).getTime() - 1).toISOString() } });
  const first = v(r, 20, { at: created });
  assert.deepEqual([G.progress(r, [first], S, NOW).have, G.progress(r, [first], S, NOW).need], [1, 2]);
  assert.equal(G.growth(r, [first, v(r, 0)], S, NOW), 'cultivating');
});
test('Cultivating needs a chain of 3; the next bar starts empty after growing', () => {
  const r = rv({ stage: 'cultivating', stageChangedAt: ago(50) });
  assert.equal(G.growth(r, [v(r, 40), v(r, 20)], S, NOW), null);
  assert.equal(G.growth(r, [v(r, 40), v(r, 20), v(r, 1)], S, NOW), 'return');
  const grown = rv({ stage: 'return', stageChangedAt: ago(1) });
  assert.equal(G.progress(grown, [v(grown, 1)], S, NOW).have, 0);
});
test('Return Visit grows into Bible Study after 3 study sessions, any age, counted from before the stage too', () => {
  const r = rv({ stage: 'return', stageChangedAt: ago(10) });
  const st = (n) => v(r, n, { progress: 'Lesson ' + n, nextStart: 'Lesson ' + (n + 1) });
  assert.equal(G.progress(r, [st(300), st(200)], S, NOW).have, 2);
  assert.equal(G.growth(r, [st(300), st(200), st(1)], S, NOW), 'study');
  assert.equal(G.stateOf(r, [st(300), st(200)], S, NOW).buds, 2);
});
test('a record created at a later stage starts that chain empty', () => {
  const created = ago(3);
  const entry = v({ id: 'x' }, 3, { at: created });
  const r = rv({ id: 'x', stage: 'cultivating', createdAt: created, stageChangedAt: created, garden: { since: entry.at } });
  assert.equal(G.progress(r, [entry], S, NOW).have, 0);
});
test('the study stage does not grow further', () => {
  assert.equal(G.growth(rv({ stage: 'study' }), [v({ id: 'z' }, 1)], S, NOW), null);
});

console.log('care');
test('wilted at 2x the window, thirsty when due, never dies', () => {
  const r = rv({ stage: 'return' });
  assert.equal(G.care(r, [v(r, 61, { plan: true })], S, NOW), G.CARE.WILTED);
  assert.equal(G.care(r, [v(r, 31, { plan: true })], S, NOW), G.CARE.DRY);
  assert.equal(G.stateOf(r, [v(r, 31)], S, NOW).word, 'Thirsty');
  assert.equal(G.stateOf(r, [v(r, 400)], S, NOW).form, 4);
});
test('steady when the last touch was a Not Home or the visit left no plan; healthy with a plan', () => {
  const r = rv({ stage: 'return' });
  assert.equal(G.care(r, [v(r, 10, { plan: true }), nh(r, 3)], S, NOW), G.CARE.STEADY);
  assert.equal(G.care(r, [v(r, 3, { plan: false })], S, NOW), G.CARE.STEADY);
  assert.equal(G.care(r, [v(r, 3, { plan: true })], S, NOW), G.CARE.HEALTHY);
  assert.equal(G.care(Object.assign({}, r, { whatsNext: 'Bring the brochure' }), [v(r, 3)], S, NOW), G.CARE.HEALTHY); // older entry: reads the record
});
test('lush takes 3 consistent visits running, each with Discuss next time; one visit lifts at most to healthy', () => {
  const r = rv({ stage: 'return' });
  assert.equal(G.care(r, [v(r, 50, { plan: true }), v(r, 30, { plan: true }), v(r, 5, { plan: true })], S, NOW), G.CARE.LUSH);
  assert.equal(G.care(r, [v(r, 90, { plan: true }), v(r, 30, { plan: true }), v(r, 5, { plan: true })], S, NOW), G.CARE.HEALTHY); // 60-day gap
  assert.equal(G.care(r, [v(r, 50, { plan: false }), v(r, 30, { plan: true }), v(r, 5, { plan: true })], S, NOW), G.CARE.HEALTHY);
  assert.equal(G.care(r, [v(r, 200, { plan: true }), v(r, 5, { plan: true })], S, NOW), G.CARE.HEALTHY); // wilted, then one visit
});
test('a study is lush when sessions are on time and each records what was covered and where to start next', () => {
  const r = rv({ stage: 'study' });
  const st = (n, x = {}) => v(r, n, Object.assign({ progress: 'L' + n, nextStart: 'L' + (n - 1) }, x));
  assert.equal(G.care(r, [st(40), st(20), st(2)], S, NOW), G.CARE.LUSH);
  assert.equal(G.care(r, [st(40), st(20, { progress: '' }), st(2)], S, NOW), G.CARE.HEALTHY);
});
test('imported visits count toward care; Potential with no conversation is steady; archived has no plant', () => {
  const r = rv({ stage: 'return' });
  assert.equal(G.care(r, [v(r, 3, { imported: true, plan: true })], S, NOW), G.CARE.HEALTHY);
  assert.equal(G.care(rv({ stage: 'yet', createdAt: ago(5) }), [], S, NOW), G.CARE.STEADY);
  assert.deepEqual(G.stateOf(rv({ stage: 'archived' }), [], S, NOW), { form: 0, care: 0 });
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', with failures' : ''));
