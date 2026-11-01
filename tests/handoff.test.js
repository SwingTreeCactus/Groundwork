// Run: node tests/handoff.test.js   (handing a contact to another publisher, v2.47)
const assert = require('node:assert/strict');
const H = require('../js/handoff.js');

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; } };

const rv = { id: 'r1', name: 'Ana Ruiz', address: '12 Elm St', neighborhood: 'Oak Park', phone: '555-1234', notes: 'Two kids', whatsNext: 'Ask about her mom',
  bestDays: [2, 6, 9], bestNote: 'after 5', publication: 'Enjoy Life', progress: 'Lesson 3', nextStart: 'Lesson 4', geo: { lat: 37.9, lng: -121.3, acc: 8 }, kind: 'olive', stage: 'study', lastTopic: 'lib-x' };
const entries = [
  { id: 'e2', type: 'visit', at: '2026-10-20T17:00:00Z', text: 'Talked about prayer' },
  { id: 'e1', type: 'nh', at: '2026-10-10T17:00:00Z', text: '' },
  { id: 'e3', type: 'stage', at: '2026-10-21T17:00:00Z', text: 'Moved' },
  { id: 'e4', type: 'visit', at: '2026-10-25T17:00:00Z', text: 'Study', progress: 'Lesson 3', nextStart: 'Lesson 4', study: true },
  { id: 'e5', type: 'visit', at: '2026-10-26T17:00:00Z', text: 'gone', deletedAt: '2026-10-27T00:00:00Z' },
];
let n = 0;
const uuid = () => 'n' + ++n;

test('packs the contact, its visits in order, and nothing private to the sender', () => {
  const d = H.pack(rv, entries, {}, { from: 'Mark', message: 'Speaks Spanish', stageKey: 'study', now: new Date('2026-10-31T15:00:00Z') });
  assert.equal(d.app, 'groundwork-handoff'); assert.equal(d.version, 1);
  assert.equal(d.contact.name, 'Ana Ruiz'); assert.equal(d.contact.area, 'Oak Park'); assert.deepEqual(d.contact.bestDays, [2, 6]);
  assert.deepEqual(d.visits.map((v) => v.type), ['nh', 'visit', 'visit']);
  assert.equal(d.visits[2].study, true);
  assert.equal(d.contact.geo.acc, undefined);
  const s = JSON.stringify(d);
  for (const k of ['olive', 'lib-x', '"r1"', 'e2']) assert.ok(!s.includes(k), k);
  assert.equal(H.isHandoff(d), true); assert.equal(H.isHandoff({ app: 'rv-app' }), false); assert.equal(H.isHandoff(null), false);
});
test('leaves out what the sender unticks', () => {
  const d = H.pack(rv, entries, { notes: false, visits: false, next: false, phone: false });
  assert.equal(d.contact.notes, ''); assert.equal(d.contact.phone, ''); assert.equal(d.contact.discussNext, ''); assert.deepEqual(d.visits, []);
});
test('unpacks into a new record with imported visits and a handed-over line', () => {
  const d = H.pack(rv, entries, {}, { from: 'Mark', message: 'Speaks Spanish', stageKey: 'study', now: new Date('2026-10-31T15:00:00Z') });
  const { rv: r, entries: es } = H.unpack(JSON.parse(JSON.stringify(d)), { uuid, stageId: 'study', now: new Date('2026-11-01T10:00:00Z') });
  assert.equal(r.stage, 'study'); assert.equal(r.name, 'Ana Ruiz'); assert.equal(r.neighborhood, 'Oak Park');
  assert.equal(r.notes.split('\n')[0], 'Handed over by Mark on 2026-10-31: Speaks Spanish.');
  assert.ok(r.notes.includes('Two kids')); assert.equal(r.whatsNext, 'Ask about her mom');
  assert.equal(es.length, 3); assert.ok(es.every((e) => e.imported && e.rvId === r.id));
  assert.equal(r.stageChangedAt, '2026-10-25T17:00:00Z');
  assert.notEqual(r.id, 'r1');
  assert.throws(() => H.unpack({}, { uuid, stageId: 'x' }));
});
test('file names are safe', () => {
  assert.equal(H.fileName('Ana / Ruiz: "family"'), 'Groundwork handoff - Ana Ruiz family.json');
  assert.equal(H.fileName(''), 'Groundwork handoff - contact.json');
});
// v2.48: the link version
(async () => {
  const ok = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; } };
  const d = H.pack(rv, entries, {}, { from: 'Mark', message: 'Speaks Spanish', stageKey: 'rv', now: new Date('2026-10-31T15:00:00Z') });
  const link = await H.toLink(d, 'https://mygroundwork.app/#/home');
  await ok('a link carries the contact after #, compressed', () => { assert.ok(link.startsWith('https://mygroundwork.app/#/handoff/z')); assert.ok(link.length < JSON.stringify(d).length * 1.4); });
  await ok('the link reads back from a whole message', async () => assert.deepEqual(await H.fromText('Mark is handing Ana over. Open: ' + link + ' thanks'), d));
  await ok('the raw file text reads back too', async () => assert.deepEqual(await H.fromText(JSON.stringify(d)), d));
  await ok('broken codes and other text give nothing', async () => {
    assert.equal(await H.fromText('https://mygroundwork.app/#/handoff/zAAAA'), null);
    assert.equal(await H.fromText('hello'), null);
    assert.equal(await H.fromText(JSON.stringify({ app: 'rv-app' })), null);
  });
  console.log(passed + ' passed');
})();
