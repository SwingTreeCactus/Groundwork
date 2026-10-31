// Run: node tests/ww.test.js   (Witness Work backup converter, v2.45)
const assert = require('node:assert/strict');
const W = require('../js/ww.js');

let passed = 0, failed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { failed++; console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; } };

let n = 0;
const uuid = () => 'id' + ++n;
const opts = { uuid, stageId: 'initial', potentialStageId: 'yet', studyStageId: 'study', closedStageId: 'archived' };
const contact = (id, name, address, extra) => Object.assign({ id, name, createdAt: '2025-05-12T06:19:34.946Z', address, email: '', phone: '', customFields: {} }, extra || {});
const talk = (id, cid, date, note, extra) => Object.assign({ id, contact: { id: cid }, date, note, isBibleStudy: false }, extra || {});
const backup = (contacts, conversations, more) => Object.assign({
  version: 1,
  contactStore: { contacts, deletedContacts: (more && more.deletedContacts) || [] },
  conversationStore: { conversations, deletedConversations: (more && more.deletedConversations) || [] },
}, more && more.top);

test('recognises a Witness Work backup and nothing else', () => {
  assert.equal(W.isBackup(backup([], [])), true);
  assert.equal(W.isBackup({ app: 'rv-app', rvs: [] }), false);
  assert.equal(W.isBackup(null), false);
  assert.throws(() => W.convert({}, opts));
});

test('addresses: state names shortened, country dropped, a city typed as the state kept as the city', () => {
  assert.equal(W.address({ line1: '1 Elm St', city: 'Stockton', state: 'California', zip: '95204', country: 'United States' }), '1 Elm St, Stockton, CA 95204');
  assert.equal(W.address({ line1: '2 Elm', line2: '', city: '', state: 'Stockton', zip: '' }), '2 Elm, Stockton');
  assert.equal(W.address({ line1: '3 Elm', city: 'Lodi', state: 'ca', zip: '' }), '3 Elm, Lodi, CA');
  assert.equal(W.address({ line1: '', city: '', state: '', zip: '' }), '');
});

test('conversations become visits, not-homes and studies, oldest first is the created date', () => {
  const r = W.convert(backup([contact('a', ' Ana ', { line1: '1 Elm', city: 'Stockton', state: 'CA', zip: '' })], [
    talk('t2', 'a', '2025-06-01T10:00:00.000Z', 'Lesson 1', { isBibleStudy: true }),
    talk('t1', 'a', '2025-03-01T10:00:00.000Z', 'Shared Isaiah 11:6', { followUp: { topic: 'Daniel 2:44' } }),
    talk('t3', 'a', '2025-06-08T10:00:00.000Z', 'Met her mom', { notAtHome: true }),
  ]), opts);
  assert.equal(r.rvs.length, 1);
  const rv = r.rvs[0];
  assert.equal(rv.name, 'Ana');
  assert.equal(rv.stage, 'study');
  assert.equal(rv.createdAt, '2025-03-01T10:00:00.000Z');
  assert.equal(rv.whatsNext, 'Daniel 2:44');
  assert.deepEqual(r.entries.map((e) => [e.type, !!e.study, e.text]), [
    ['visit', false, 'Shared Isaiah 11:6\n\nNext time: Daniel 2:44'],
    ['visit', true, 'Lesson 1'],
    ['nh', false, 'Met her mom'],
  ]);
  assert.ok(r.entries.every((e) => e.imported && e.rvId === rv.id));
});

test('stages: no conversation is Potential, a not-home only is Potential, a talk is the chosen stage', () => {
  const r = W.convert(backup([contact('a', 'A', null), contact('b', 'B', null), contact('c', 'C', null)], [
    talk('1', 'b', '2025-03-01T10:00:00.000Z', '', { notAtHome: true }),
    talk('2', 'c', '2025-03-01T10:00:00.000Z', 'hello'),
  ]), opts);
  assert.deepEqual(r.rvs.map((x) => x.stage), ['yet', 'yet', 'initial']);
});

test('deleted conversations are left out; deleted contacts only when asked, archived', () => {
  const data = backup([contact('a', 'A', null)], [talk('1', 'a', '2025-03-01T10:00:00.000Z', 'kept'), talk('2', 'a', '2025-03-02T10:00:00.000Z', 'gone'), talk('3', 'z', '2025-03-02T10:00:00.000Z', 'theirs')],
    { deletedConversations: [{ id: '2' }], deletedContacts: [contact('z', 'Zed', null)] });
  const r = W.convert(data, opts);
  assert.equal(r.deletedCount, 1);
  assert.deepEqual(r.rvs.map((x) => x.name), ['A']);
  assert.deepEqual(r.entries.map((e) => e.text), ['kept']);
  const r2 = W.convert(data, Object.assign({ includeDeleted: true }, opts));
  const zed = r2.rvs.find((x) => x.name === 'Zed');
  assert.equal(zed.stage, 'archived');
  assert.equal(zed.archiveReason, 'other');
  assert.equal(r2.entries.length, 2);
});

test('coordinates, phone, email and custom fields are kept; nameless contacts skipped', () => {
  const r = W.convert(backup([
    contact('a', 'A', null, { phone: '209-555-0100', email: 'a@example.com', customFields: { Language: 'Urdu' }, coordinate: { latitude: 37.9, longitude: -121.3 } }),
    contact('b', '  ', null),
  ], []), opts);
  assert.equal(r.skipped, 1);
  const a = r.rvs[0];
  assert.equal(a.phone, '209-555-0100');
  assert.equal(a.notes, 'Email: a@example.com\nLanguage: Urdu');
  assert.deepEqual([a.geo.lat, a.geo.lng], [37.9, -121.3]);
});

test('best day comes from the last conversation where they were home', () => {
  const r = W.convert(backup([contact('a', 'A', null)], [
    talk('1', 'a', '2025-03-04T18:00:00.000Z', 'Tuesday talk'),
    talk('2', 'a', '2025-03-06T18:00:00.000Z', '', { notAtHome: true }),
  ]), Object.assign({ bestFromLast: true }, opts));
  assert.deepEqual(r.rvs[0].bestDays, [new Date('2025-03-04T18:00:00.000Z').getDay()]);
});

console.log(passed + ' passed' + (failed ? ', ' + failed + ' failed' : ''));
