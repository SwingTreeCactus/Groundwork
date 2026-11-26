// node tests/geo-dist.test.js — v2.62: distance between a pin and an address, and how it reads
const assert = require('assert');
const G = require('../js/geo.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

test('dist: a tenth of a degree of latitude is about 11.1 km', () => {
  const d = G.dist({ lat: 37.9, lng: -121.3 }, { lat: 38.0, lng: -121.3 });
  assert(Math.abs(d - 11119) < 30, d);
});
test('dist: the same point is 0; missing points are 0', () => {
  assert.strictEqual(G.dist({ lat: 1, lng: 2 }, { lat: 1, lng: 2 }), 0);
  assert.strictEqual(G.dist(null, { lat: 1, lng: 2 }), 0);
});
test('distText: feet under a tenth of a mile (to 50 ft), miles above', () => {
  assert.strictEqual(G.distText(152), '500 ft');
  assert.strictEqual(G.distText(5), '50 ft');
  assert.strictEqual(G.distText(644), '0.4 mi');
  assert.strictEqual(G.distText(2224), '1.4 mi');
  assert.strictEqual(G.distText(30000), '19 mi');
});
test('FAR_M is about 500 ft', () => assert.strictEqual(G.FAR_M, 150));
console.log('\n' + n + ' passed');
