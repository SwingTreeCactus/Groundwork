// node tests/areas.test.js — area shapes (v2.50): inside, snapping, trimming, sorting, renames
const assert = require('assert');
const A = require('../js/areas.js');
const pc = require('../vendor/polygon-clipping/polygon-clipping.umd.min.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const settings = { areaShapes: [
  { id: 'a', area: 'Oak Park', pts: sq(0, 0, 10, 10) },
  { id: 'b', area: 'Lakeview', pts: sq(10, 0, 20, 10) },
  { id: 'x', area: 'Broken', pts: [[0, 0]] },
] };

test('list skips broken shapes; shapeOf ignores case and spacing', () => {
  assert.equal(A.list(settings).length, 2);
  assert.equal(A.shapeOf(settings, '  oak   park ').id, 'a');
  assert.equal(A.shapeOf(settings, 'Downtown'), null);
});
test('areaAt: inside a shape, outside every shape, and holes', () => {
  assert.equal(A.areaAt(settings, { lng: 5, lat: 5 }), 'Oak Park');
  assert.equal(A.areaAt(settings, { lng: 15, lat: 2 }), 'Lakeview');
  assert.equal(A.areaAt(settings, { lng: 25, lat: 5 }), '');
  assert.equal(A.areaAt(settings, null), '');
  const holed = { areaShapes: [{ area: 'Ring', pts: sq(0, 0, 10, 10), holes: [sq(4, 4, 6, 6)] }] };
  assert.equal(A.areaAt(holed, { lng: 5, lat: 5 }), '');
  assert.equal(A.areaAt(holed, { lng: 2, lat: 2 }), 'Ring');
});
test('snap: corners first, then edges, else the point itself', () => {
  const others = [{ name: 'Oak Park', px: sq(100, 100, 200, 200) }];
  assert.deepEqual(A.snap([108, 95], others), { x: 100, y: 100, snap: 'corner', of: 'Oak Park' });
  const e = A.snap([150, 190], others);
  assert.equal(e.snap, 'edge'); assert.equal(e.y, 200); assert.equal(e.x, 150);
  assert.equal(A.snap([400, 400], others).snap, '');
});
test('trim: the overlap with neighbours comes off; untouched shapes stay whole', () => {
  const t = A.trim(sq(5, 2, 15, 14), A.list(settings), pc);
  assert.deepEqual(t.trimmed.sort(), ['Lakeview', 'Oak Park']);
  assert.equal(A.ringArea(t.pts), 40); // only the strip above both (y 10 to 14) is kept
  const free = A.trim(sq(30, 0, 40, 10), A.list(settings), pc);
  assert.deepEqual(free.trimmed, []); assert.equal(A.ringArea(free.pts), 100);
  const half = A.trim(sq(15, 0, 25, 10), A.list(settings), pc);
  assert.deepEqual(half.trimmed, ['Lakeview']); assert.equal(A.ringArea(half.pts), 50);
  assert.ok(half.pts.every((p) => p[0] >= 20 - 1e-9), 'only the part east of Lakeview is kept');
});
test('trim: nothing left, and a shape around another gets a hole', () => {
  assert.equal(A.trim(sq(1, 1, 9, 9), A.list(settings), pc), null);
  const t = A.trim(sq(-10, -10, 30, 20), A.list(settings), pc);
  assert.equal(t.holes.length, 1);
  assert.equal(A.areaAt({ areaShapes: [{ area: 'Big', pts: t.pts, holes: t.holes }] }, { lng: 5, lat: 5 }), '');
});
test('moves: who goes where, who is already there, outside, not on the map', () => {
  const rvs = [
    { id: 1, neighborhood: 'Oak Park', p: { lng: 5, lat: 5 } },
    { id: 2, neighborhood: 'Lakeview', p: { lng: 5, lat: 6 } },
    { id: 3, neighborhood: '', p: { lng: 12, lat: 5 } },
    { id: 4, neighborhood: 'Oak Park', p: { lng: 50, lat: 50 } },
    { id: 5, neighborhood: 'Oak Park', p: null },
    { id: 6, neighborhood: 'Elsewhere', p: { lng: 60, lat: 60 } },
  ];
  const m = A.moves(settings, rvs, (r) => r.p);
  assert.deepEqual(m.move.map((x) => [x.rv.id, x.from, x.to]), [[2, 'Lakeview', 'Oak Park'], [3, '', 'Lakeview']]);
  assert.equal(m.already, 1);
  assert.deepEqual(m.outside.map((r) => r.id), [4]);
  assert.deepEqual(m.unplaced.map((r) => r.id), [5]);
  const only = A.moves(settings, rvs, (r) => r.p, ['Lakeview']);
  assert.deepEqual(only.move.map((x) => x.rv.id), [3]);
});
test('rename carries the shape; merging into a shaped area keeps that shape; remove drops it', () => {
  const s = A.list(settings);
  assert.equal(A.renamed(s, 'Oak Park', 'Oakpark East').find((x) => x.id === 'a').area, 'Oakpark East');
  const merged = A.renamed(s, 'Oak Park', 'lakeview');
  assert.deepEqual(merged.map((x) => x.id), ['b']);
  assert.deepEqual(A.removed(s, 'oak park').map((x) => x.id), ['b']);
  assert.equal(A.renamed(s, 'Nowhere', 'X'), s);
});
console.log(n + ' passed');
