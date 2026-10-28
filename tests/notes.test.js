// Run: node tests/notes.test.js   (notes import, the plain parts, v2.31)
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
globalThis.DecompressionStream = globalThis.DecompressionStream || require('node:stream/web').DecompressionStream;
const N = require('../js/notes.js');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const enc = (s) => new TextEncoder().encode(s);

// a tiny zip writer for the tests (deflated entries)
function zip(files) {
  const parts = [], central = [];
  let off = 0;
  files.forEach(([name, text]) => {
    const raw = Buffer.from(text), data = zlib.deflateRawSync(raw), nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nm, data); central.push(ch, nm); off += 30 + nm.length + data.length;
  });
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}

test('text files become notes, titled by file name', async () => {
  const r = await N.readFiles([{ name: 'Maria Lopez.txt', bytes: enc('﻿Lives at 12 Elm. Two kids.'), lastModified: Date.UTC(2026, 9, 1) }]);
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].title, 'Maria Lopez'); assert.equal(r.notes[0].text, 'Lives at 12 Elm. Two kids.');
  assert.equal(r.notes[0].date.slice(0, 10), '2026-10-01');
});
test('Google Takeout zip: Keep .json used, matching .html and trashed notes skipped', async () => {
  const keep = (o) => JSON.stringify(Object.assign({ isTrashed: false, userEditedTimestampUsec: Date.UTC(2026, 8, 20) * 1000 }, o));
  const z = zip([
    ['Takeout/Keep/Elm St.json', keep({ title: 'Elm St', textContent: '12 Elm - Ana, likes gardening' })],
    ['Takeout/Keep/Elm St.html', '<html><title>Elm St</title><body>dup</body></html>'],
    ['Takeout/Keep/List.json', keep({ title: 'Bring', listContent: [{ text: 'brochure' }, { text: 'tract' }] })],
    ['Takeout/Keep/Old.json', keep({ title: 'Old', textContent: 'gone', isTrashed: true })],
    ['Takeout/Keep/Labels.txt', ''],
    ['Takeout/archive_browser.html', '<html><title>Archive</title><body><p>Your archive</p></body></html>'],
  ]);
  const r = await N.readFiles([{ name: 'takeout.zip', bytes: z }]);
  const titles = r.notes.map((n) => n.title);
  assert.ok(titles.includes('Elm St') && titles.includes('Bring') && !titles.includes('Old'));
  assert.equal(r.notes.find((n) => n.title === 'Bring').text, '- brochure\n- tract');
  assert.equal(r.notes.find((n) => n.title === 'Elm St').date.slice(0, 10), '2026-09-20');
  assert.match(r.notes[0].from, /takeout\.zip › /);
});
test('html to text keeps line breaks and entities', () => {
  assert.equal(N.htmlToText('<p>Ana &amp; Luis</p><div>Apt 4<br>Tue&nbsp;pm</div><ul><li>a</li></ul>'), 'Ana & Luis\nApt 4\nTue pm\n- a');
});
test('unknown files are listed as skipped', async () => {
  const r = await N.readFiles([{ name: 'photo.jpg', bytes: new Uint8Array([255, 216, 0]) }]);
  assert.equal(r.notes.length, 0); assert.deepEqual(r.skipped, ['photo.jpg']);
});
test('batches pack small notes and cut a long one at blank lines', () => {
  const small = { title: 'a', text: 'x'.repeat(100), date: null };
  const long = { title: 'Territory 4', text: Array.from({ length: 30 }, (_, i) => 'Para ' + i + ' ' + 'y'.repeat(300)).join('\n\n'), date: '2026-10-01T00:00:00Z' };
  const b = N.batches([small, small, long], 2000);
  assert.ok(b.every((batch) => batch.reduce((a, p) => a + p.text.length, 0) <= 2000));
  const all = b.flat();
  assert.equal(all[0].id, 'n1'); assert.equal(all[1].id, 'n2');
  assert.ok(all.some((p) => p.id === 'n3.1') && all.every((p) => !p.text.startsWith('\n')));
  assert.equal(all.filter((p) => p.title === 'Territory 4').map((p) => p.text).join('\n\n'), long.text);
  assert.equal(all.find((p) => p.id === 'n3.1').date, '2026-10-01');
});
test('Claude contacts are checked and cleaned', () => {
  const c = N.cleanContacts([
    { name: ' Ana ', address: '12 Elm', notes: 'Likes gardening', visits: [{ date: '2026-10-03', text: 'Read Ps 37', type: 'visit' }, { date: '2026-09-01', type: 'nh', text: '' }, { date: 'last week', text: 'Talked about family' }], discussNext: 'Bring brochure', nextVisit: 'soon', study: 'yes', source: 'n1' },
    { name: '', notes: '', visits: [] },
    'junk',
    { name: '', notes: 'Man in blue house' },
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].name, 'Ana'); assert.equal(c[0].visits.length, 2); assert.equal(c[0].visits[0].type, 'nh');
  assert.equal(c[0].notes, 'Likes gardening\n\nTalked about family', 'an undated visit is kept in the notes');
  assert.equal(c[0].nextVisit, ''); assert.equal(c[0].study, false);
  assert.equal(c[1].name, 'Unnamed');
});
test('a contact becomes a record and dated timeline entries', () => {
  let n = 0;
  const [c] = N.cleanContacts([{ name: 'Ben', address: '4 Oak', notes: 'n', discussNext: 'd', nextVisit: '2026-11-05', study: true, visits: [{ date: '2026-10-03', text: 'Talked', type: 'visit' }] }]);
  const r = N.toRecord(c, { uuid: () => 'id' + n++, stage: 'initial', studyStage: 'study' });
  assert.equal(r.rv.stage, 'study'); assert.equal(r.rv.whatsNext, 'd'); assert.equal(r.rv.nextVisit, '2026-11-05'); assert.equal(r.rv.imported, true);
  assert.equal(r.rv.createdAt.slice(0, 10), '2026-10-03');
  assert.equal(r.entries.length, 1); assert.equal(r.entries[0].rvId, r.rv.id); assert.equal(r.entries[0].type, 'visit'); assert.equal(r.entries[0].text, 'Talked');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
  }
  console.log(passed + ' passed');
})();
