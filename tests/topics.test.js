// v2.40: scripture references, links, the forgiving topic search and the scripture index. Run: node tests/topics.test.js
const assert = require('node:assert/strict');
require('../js/library.js'); require('../js/topics.js');
const { library: LIB, topics: T } = globalThis.RV;
let ok = 0, bad = 0;
const test = (name, fn) => { try { fn(); ok++; console.log('  ok  ' + name); } catch (e) { bad++; console.log('FAIL  ' + name + '\n' + e.message); } };
const th = (id) => (LIB.THEMES.find((x) => x.id === id) || {}).name;

test('the library: 60 topics in 11 themes, every theme used, videos for all but one', () => {
  assert.equal(LIB.TOPICS.length, 60);
  assert.equal(LIB.THEMES.length, 11);
  assert.equal(new Set(LIB.TOPICS.map((t) => t.id)).size, 60);
  for (const t of LIB.THEMES) assert.ok(LIB.TOPICS.some((x) => x.theme === t.id), t.name);
  assert.ok(LIB.TOPICS.every((t) => t.question && t.source.startsWith('https://wol.jw.org/')));
  assert.equal(LIB.TOPICS.filter((t) => t.video).length, 59);
});
test('series: 27, every part a real topic, seriesOf gives the part', () => {
  assert.equal(LIB.SERIES.length, 27);
  for (const s of LIB.SERIES) {
    assert.ok(s.topics.length >= 2, s.name);
    for (const id of s.topics) assert.ok(LIB.byId(id), s.name + ': ' + id);
    assert.match(s.ran, /^\d{4}-\d{2}$/);
  }
  const s = LIB.SERIES[0];
  assert.deepEqual(LIB.seriesOf(s.topics[1]).find((x) => x.series === s), { series: s, part: 2, of: s.topics.length });
  assert.ok(LIB.TOPICS.filter((t) => !LIB.seriesOf(t.id).length).length <= 4);
});
test('references parse: verse lists, ranges, two refs, full and short book names', () => {
  const p = (s) => T.parseRefs(s).map((r) => [r.book, r.ch, r.from, r.to]);
  assert.deepEqual(p('Ps 37:10, 11 or Isa 9:6, 7'), [[19, 37, 10, 11], [23, 9, 6, 7]]);
  assert.deepEqual(p('2Ti 3:1-5'), [[55, 3, 1, 5]]);
  assert.deepEqual(p('1 John 4:8; Re 21:4'), [[62, 4, 8, 8], [66, 21, 4, 4]]);
  assert.deepEqual(p('Song of Solomon 2:1'), [[22, 2, 1, 1]]);
  assert.deepEqual(p('Psalm 83'), [[19, 83, 0, 0]]);
  assert.deepEqual(p('not a verse'), []);
});
test('a verse links to JW Library / jw.org by book, chapter and verse', () => {
  const [r] = T.parseRefs('Ps 37:29');
  assert.equal(T.linkFor(r), 'https://www.jw.org/finder?wtlocale=E&pub=nwtsty&bible=19037029');
  assert.equal(T.linkFor(T.parseRefs('Ps 37:10, 11')[0]), 'https://www.jw.org/finder?wtlocale=E&pub=nwtsty&bible=19037010-19037011');
});
test('search forgives: loose verse references, typos, partial words', () => {
  const top = (q, n) => T.search(LIB.TOPICS, q, th).slice(0, n || 3).map((t) => t.title);
  for (const q of ['psalms 37', 'ps37', 'Psalm 37']) assert.ok(top(q).includes("God's promise for the earth"), q);
  assert.deepEqual(top('37 29', 1), ["God's promise for the earth"]);
  assert.ok(top('sufering', 5).includes('Why people suffer') && /suffer/i.test(top('sufering', 1)[0]));
  assert.ok(top('prayr', 2).includes('Does God hear prayers?'));
  assert.deepEqual(top('marrage', 1), ['A strong marriage']);
  assert.ok(top('1 jn 5 19', 1)[0] === 'Why people suffer');
  assert.equal(T.search(LIB.TOPICS, 'zzzqqq', th).length, 0);
  assert.equal(T.search(LIB.TOPICS, '', th).length, 60);
});
test('the index runs in Bible order and names the topics using each verse', () => {
  const idx = T.index(LIB.TOPICS);
  assert.ok(idx.length >= 50);
  assert.equal(idx[0].ref.abbr, 'Ge');
  assert.equal(idx[idx.length - 1].ref.abbr, 'Re');
  const books = idx.map((x) => x.ref.book);
  assert.deepEqual(books, books.slice().sort((a, b) => a - b));
  assert.ok(idx.find((x) => x.ref.label === 'Ps 37:29').topics.some((t) => t.title === "God's promise for the earth"));
});
console.log(ok + ' passed' + (bad ? ', ' + bad + ' failed' : ''));
if (bad) process.exit(1);
