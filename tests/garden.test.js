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
test('healthy after a Not Home or a visit with no plan (steady folded into healthy, v2.19)', () => {
  const r = rv({ stage: 'return' });
  assert.equal(G.care(r, [v(r, 10, { plan: true }), nh(r, 3)], S, NOW), G.CARE.HEALTHY);
  assert.equal(G.care(r, [v(r, 3, { plan: false })], S, NOW), G.CARE.HEALTHY);
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
test('imported visits count toward care; Potential with no conversation is healthy; archived has no plant', () => {
  const r = rv({ stage: 'return' });
  assert.equal(G.care(r, [v(r, 3, { imported: true, plan: true })], S, NOW), G.CARE.HEALTHY);
  assert.equal(G.care(rv({ stage: 'yet', createdAt: ago(5) }), [], S, NOW), G.CARE.HEALTHY);
  assert.deepEqual(G.stateOf(rv({ stage: 'archived' }), [], S, NOW), { form: 0, care: 0 });
});

test('Potential and Initial Call never flourish, even with a planned run (imports, manual moves)', () => {
  const r = rv({ stage: 'initial' });
  const run = [v(r, 50, { plan: true, imported: true }), v(r, 30, { plan: true, imported: true }), v(r, 5, { plan: true, imported: true })];
  assert.equal(G.care(r, run, S, NOW), G.CARE.HEALTHY);
  assert.equal(G.care(Object.assign({}, r, { stage: 'yet' }), run, S, NOW), G.CARE.HEALTHY);
  assert.equal(G.care(Object.assign({}, r, { stage: 'cultivating' }), run, S, NOW), G.CARE.LUSH);
});

console.log('almost growing and insights');
const it = (r, es) => ({ rv: r, entries: es.slice().sort((a, b) => (a.at < b.at ? 1 : -1)) });
test('almost growing lists RVs one qualifying visit from the next form', () => {
  const a = rv({ stage: 'cultivating', stageChangedAt: ago(60) });
  const b = rv({ stage: 'cultivating', stageChangedAt: ago(60) });
  const c = rv({ stage: 'yet', createdAt: ago(3), stageChangedAt: ago(3) });
  const items = [it(a, [v(a, 40), v(a, 20)]), it(b, [v(b, 20)]), it(c, [])];
  assert.deepEqual(G.almost(items, S, NOW).map((x) => x.it.rv.id).sort(), [a.id, c.id].sort());
});
test('week ring: due RVs seen this week; a later follow-up date takes one out', () => {
  const ws = G.weekStart(NOW); // Sun 18 Oct
  assert.equal(ws.getDay(), 0);
  const a = rv({ stage: 'return' }), b = rv({ stage: 'return' }), c = rv({ stage: 'return', snoozedUntil: ahead(10) }), d = rv({ stage: 'return' });
  const items = [it(a, [v(a, 35), v(a, 1)]), it(b, [v(b, 40)]), it(c, [v(c, 40)]), it(d, [v(d, 10)])];
  const r = G.weekRing(items, S, ws, NOW);
  assert.deepEqual([r.due, r.seen, r.left], [2, 1, 1]);
});
test('week ring: a Not Home this week counts as seen (v2.21)', () => {
  const ws = G.weekStart(NOW);
  const a = rv({ stage: 'return' }), b = rv({ stage: 'return' });
  const items = [it(a, [v(a, 40), nh(a, 1)]), it(b, [v(b, 40), nh(b, 10)])]; // b's NH was last week
  const r = G.weekRing(items, S, ws, NOW);
  assert.deepEqual([r.due, r.seen, r.left], [2, 1, 1]);
});
test('a recent Not Home keeps a thirsty plant from wilting; only a conversation revives it (v2.21)', () => {
  const r = rv({ stage: 'return' });
  assert.equal(G.care(r, [v(r, 65)], S, NOW), G.CARE.WILTED);
  assert.equal(G.care(r, [v(r, 65), nh(r, 10)], S, NOW), G.CARE.DRY);    // tried at 55 days, still thirsty then
  assert.equal(G.care(r, [v(r, 65), nh(r, 20)], S, NOW), G.CARE.WILTED); // hold over after 14 days
  assert.equal(G.care(r, [v(r, 65), nh(r, 3)], S, NOW), G.CARE.WILTED);  // already wilting when tried
  assert.equal(G.care(r, [v(r, 40), nh(r, 1)], S, NOW), G.CARE.DRY);     // a Not Home never revives
  assert.equal(G.care(r, [v(r, 40), nh(r, 1), v(r, 0)], S, NOW), G.CARE.HEALTHY);
});
test('round: the latest run of logs within 90 minutes, shown once, after a 30-minute rest (v2.22)', () => {
  const at = (h, m) => new Date(2026, 9, 21, h, m).toISOString();
  const a = rv({ stage: 'return' }), b = rv({ stage: 'return' }), c = rv({ stage: 'yet', createdAt: at(10, 40), stageChangedAt: at(10, 40) });
  const items = [
    it(a, [v(a, 20), { id: 'x1', rvId: a.id, type: 'nh', at: at(9, 0) }, { id: 'x2', rvId: a.id, type: 'visit', at: at(10, 20), plan: true, revived: true }]),
    it(b, [{ id: 'x3', rvId: b.id, type: 'visit', at: at(9, 30), plan: false }, { id: 'x4', rvId: b.id, type: 'stage', grew: true, from: 'cultivating', to: 'return', at: at(9, 30) }]),
    it(c, []),
  ];
  const noon = new Date(2026, 9, 21, 11, 30);
  const r = G.round(items, S, noon, null);
  assert.deepEqual([r.tried, r.talks, r.nh, r.plans, r.revived, r.added, r.grew.length, r.talked.length], [2, 2, 1, 1, 1, 1, 1, 2]);
  assert.equal(r.start.getHours(), 9);
  assert.equal(G.round(items, S, noon, r.key), null);                          // shown once
  assert.equal(G.round(items, S, new Date(2026, 9, 21, 10, 50), null), null);  // still out (rest not reached)
  assert.ok(G.round(items, S, new Date(2026, 9, 21, 10, 50), null, true));      // unless forced
  assert.equal(G.round(items, S, new Date(2026, 9, 22, 12, 0), null), null);   // stale after 18 hours
  assert.equal(G.round([it(a, [{ id: 'y', rvId: a.id, type: 'nh', at: at(9, 0) }])], S, noon, null), null); // too few logs
});
test('lush run: planned conversations in a row within the gap (v2.22)', () => {
  const r = rv({ stage: 'return' });
  assert.equal(G.lushRun(r, [v(r, 50, { plan: true }), v(r, 30, { plan: true }), v(r, 10, { plan: true })], S, NOW), 3);
  assert.equal(G.lushRun(r, [v(r, 30, { plan: false }), v(r, 10, { plan: true })], S, NOW), 1);
  assert.equal(G.lushRun(r, [v(r, 80, { plan: true }), v(r, 10, { plan: true })], S, NOW), 1); // 70-day gap
  assert.equal(G.lushRun(r, [v(r, 40, { plan: true })], S, NOW), 0);                           // too long ago
});
test('streak counts perfect weeks since the garden started, with a freeze from a perfect month', () => {
  const a = rv({ stage: 'return', createdAt: ago(300) });
  // a visit every 10 days keeps it from ever coming due
  const es = []; for (let n = 120; n >= 0; n -= 10) es.push(v(a, n));
  const s1 = G.streak([it(a, es)], S, NOW, ago(120));
  assert.ok(s1.streak >= 16 && s1.best === s1.streak);
  assert.ok(s1.freezes >= 1);
  assert.equal(s1.weeks.length, 12);
  // since now: nothing counted yet
  assert.equal(G.streak([it(a, es)], S, NOW, NOW.toISOString()).streak, 0);
});
test('rates and the activity grid', () => {
  const a = rv({ stage: 'return' });
  const items = [it(a, [v(a, 1, { plan: true }), v(a, 2, { plan: false }), nh(a, 3), v(a, 4), v(a, 4)])];
  const r = G.rates(items, NOW);
  assert.equal(r.found, 4 / 5);
  assert.equal(r.prepared, 0.5);
  const g = G.activityGrid(items, NOW);
  assert.equal(g.length, 84);
  assert.deepEqual(g.slice(-5), [2, 0, 1, 1, 0]);
});
test('plots group by area; exhibits count only activity since the garden started', () => {
  const a = rv({ stage: 'return', neighborhood: 'Oak Park' }), b = rv({ stage: 'study', neighborhood: 'Oak Park' });
  const items = [it(a, [v(a, 50)]), it(b, [v(b, 3, { progress: 'L1', nextStart: 'L2' })])];
  const p = G.plots(items, S, NOW);
  assert.equal(p.length, 1); assert.equal(p[0].thirsty, 1); assert.equal(p[0].plants[0].it.rv.id, a.id);
  assert.equal(G.exhibitsEarned(items, S, NOW, ago(10), 0)['first-study'], true);
  assert.equal(G.exhibitsEarned(items, S, NOW, ago(1), 0)['first-study'], false);
});

test('week recap: the week that just ended, once, never for a week before the garden started', () => {
  const a = rv({ stage: 'cultivating', name: 'Ana' });
  const ws = U.addDays(G.weekStart(NOW), -7); // Sun 11 Oct
  const grewAt = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 2, 10).toISOString();
  const items = [it(a, [v(a, 12), { id: 'g1', rvId: a.id, type: 'stage', from: 'initial', to: 'cultivating', grew: true, at: grewAt }])];
  const r = G.recap(items, S, NOW, ago(60), null);
  assert.equal(r.key, U.toDateStr(ws));
  assert.equal(r.grew.length, 1); assert.equal(r.grew[0].to, 'cultivating');
  assert.equal(G.recap(items, S, NOW, ago(60), r.key), null);
  assert.equal(G.recap(items, S, NOW, ago(1), null), null); // garden started this week
});
test('sky follows the clock', () => {
  assert.deepEqual([3, 7, 12, 18, 21].map((h) => G.skyOf(new Date(2026, 9, 21, h))), ['night', 'morning', 'day', 'dusk', 'night']);
});

test('map: restyle uses Groundwork colours and drops shops, bus stops, house numbers and buildings', () => {
  const M = require('../js/gmap.js');
  const st = { version: 8, sources: {}, layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': '#00f' } },
    { id: 'park', type: 'fill', 'source-layer': 'park', paint: {} },
    { id: 'highway_minor', type: 'line', 'source-layer': 'transportation', paint: {} },
    { id: 'highway_major_casing', type: 'line', 'source-layer': 'transportation', paint: {} },
    { id: 'poi_label', type: 'symbol', 'source-layer': 'poi', paint: {} },
    { id: 'housenumber', type: 'symbol', 'source-layer': 'housenumber', paint: {} },
    { id: 'road_label', type: 'symbol', 'source-layer': 'transportation_name', paint: {} },
    { id: 'building-3d', type: 'fill-extrusion', 'source-layer': 'building', paint: {} }] };
  const out = M.restyle(st, false), T = M.THEMES.light;
  const by = Object.fromEntries(out.layers.map((l) => [l.id, l]));
  assert.ok(!by.poi_label && !by.housenumber);
  assert.equal(by.background.paint['background-color'], T.bg);
  assert.equal(by.water.paint['fill-color'], T.water);
  assert.equal(by.park.paint['fill-color'], T.park);
  assert.equal(by.highway_minor.paint['line-color'], T.minor);
  assert.equal(by.highway_major_casing.paint['line-color'], T.roadCase);
  assert.equal(by.road_label.paint['text-color'], T.text);
  assert.ok(!by['building-3d']); // buildings hidden for a calmer map (v2.19)
  assert.equal(st.layers[1].paint['fill-color'], '#00f'); // the original is untouched
  assert.equal(M.restyle(st, true).layers[0].paint['background-color'], M.THEMES.dark.bg);
});
test('map placement: geotag first, else the looked-up address, looked up again when the address changes', () => {
  const GEO = require('../js/geo.js');
  assert.deepEqual(GEO.pointOf({ address: '1 A St', geo: { lat: 1, lng: 2 }, approx: { q: '1 a st', lat: 5, lng: 6 } }), { lat: 1, lng: 2, approx: false });
  assert.deepEqual(GEO.pointOf({ address: '1 A St', approx: { q: '1 a st', lat: 5, lng: 6 } }), { lat: 5, lng: 6, approx: true });
  assert.equal(GEO.pointOf({ address: '2 B St', approx: { q: '1 a st', lat: 5, lng: 6 } }), null);
  assert.equal(GEO.needsLookup({ address: '2 B St', approx: { q: '1 a st', lat: 5, lng: 6 } }), true);
  assert.equal(GEO.needsLookup({ address: '1 A St', approx: { q: '1 a st', fail: true } }), false);
  assert.equal(GEO.needsLookup({ address: '' }), false);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', with failures' : ''));
