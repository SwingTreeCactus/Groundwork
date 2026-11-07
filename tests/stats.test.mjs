// Run: node tests/stats.test.mjs   (the usage stats Worker, v2.56; D1 played by Node's built-in SQLite)
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker, { clean, record, summary, sameKey, _reset, PAGE } from '../worker/stats.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}
// a small D1 look-alike: prepare().bind().run/first/all, batch, over SQLite
function d1() {
  const db = new DatabaseSync(':memory:');
  let written = 0;
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); written += r.changes; return { meta: { changes: r.changes } }; },
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; }, written: () => written, raw: db };
}
const ID = (n) => ('a'.repeat(31) + n).slice(-32);
const ping = (env, body, origin = 'https://mygroundwork.app') => worker.fetch(new Request('https://stats.example.workers.dev/ping', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
const ENV = () => ({ DB: d1(), ALLOWED_ORIGIN: 'https://mygroundwork.app', ADMIN_KEY: 'correct horse battery staple' });

await test('a check-in is cleaned: unknown features dropped, anything off refused', () => {
  assert.deepEqual(clean({ id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed', f: ['garden', 'drive', 'name:Ana', 'calendar'] }), { id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed', f: 'garden,calendar,drive' });
  assert.equal(clean({ id: 'short', v: '2.56.0', device: 'ios', mode: 'installed' }), null);
  assert.equal(clean({ id: ID(1), v: '2.56', device: 'ios', mode: 'installed' }), null);
  assert.equal(clean({ id: ID(1), v: '2.56.0', device: 'watch', mode: 'installed' }), null);
  assert.equal(clean({ id: ID(1), v: '2.56.0', device: 'ios', mode: 'tv' }), null);
});
await test('only the app’s own site may check in; bad bodies are refused', async () => {
  _reset(); const env = ENV();
  assert.equal((await ping(env, { id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed' }, 'https://evil.example')).status, 403);
  assert.equal((await ping(env, { id: 'x', v: '2.56.0', device: 'ios', mode: 'installed' })).status, 400);
  const pre = await worker.fetch(new Request('https://s/ping', { method: 'OPTIONS', headers: { Origin: 'https://mygroundwork.app' } }), env);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://mygroundwork.app');
  const r = await ping(env, { id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed', f: ['garden'] });
  assert.equal(r.status, 200);
});
await test('an update is the same install: counted once, its version moves on', async () => {
  _reset(); const db = d1();
  await record(db, clean({ id: ID(1), v: '2.55.0', device: 'ios', mode: 'installed' }), Date.parse('2026-11-01T12:00:00Z'));
  await record(db, clean({ id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed' }), Date.parse('2026-11-05T12:00:00Z'));
  await record(db, clean({ id: ID(2), v: '2.56.0', device: 'android', mode: 'browser', f: ['garden', 'drive'] }), Date.parse('2026-11-05T13:00:00Z'));
  const s = await summary(db, Date.parse('2026-11-05T20:00:00Z'));
  assert.equal(s.ever, 2);
  assert.deepEqual(s.active, { day: 2, week: 2, month: 2 });
  assert.equal(s.new.week, 2);
  assert.deepEqual(s.versions, [{ k: '2.56.0', n: 2 }], 'both on the new version');
  assert.deepEqual(s.devices.map((x) => x.k).sort(), ['android', 'ios']);
  assert.equal(s.features.find((x) => x.k === 'drive').n, 1);
  assert.equal(s.series.length, 60); assert.equal(s.series[59].active, 2); assert.equal(s.series[55].active, 1);
});
await test('active counts move with time; an install that stops checking in drops out of active but stays in “ever”', async () => {
  _reset(); const db = d1();
  await record(db, clean({ id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed' }), Date.parse('2026-09-01T12:00:00Z'));
  await record(db, clean({ id: ID(2), v: '2.56.0', device: 'ios', mode: 'installed' }), Date.parse('2026-11-04T12:00:00Z'));
  const s = await summary(db, Date.parse('2026-11-05T12:00:00Z'));
  assert.equal(s.ever, 2); assert.equal(s.active.month, 1); assert.equal(s.active.day, 0); assert.equal(s.new.month, 1);
});
await test('checking in twice in a day writes nothing new for the install', async () => {
  _reset(); const db = d1();
  const r = clean({ id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed' });
  await record(db, r, Date.parse('2026-11-05T08:00:00Z'));
  const w = db.written();
  await record(db, r, Date.parse('2026-11-05T18:00:00Z'));
  assert.ok(db.written() - w <= 1, 'at most the day row is touched again');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM days').get().n, 1);
});
await test('the numbers need the admin key; the page holds no data', async () => {
  _reset(); const env = ENV();
  await ping(env, { id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed' });
  const get = (h) => worker.fetch(new Request('https://s/api/summary', { headers: h || {} }), env);
  assert.equal((await get()).status, 401);
  assert.equal((await get({ Authorization: 'Bearer wrong' })).status, 401);
  const ok = await get({ Authorization: 'Bearer correct horse battery staple' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).ever, 1);
  const page = await worker.fetch(new Request('https://s/'), env);
  assert.equal(page.status, 200); assert.match(await page.text(), /Groundwork stats/);
  assert.ok(!PAGE.includes(ID(1)));
  assert.ok(sameKey('abc', 'abc') && !sameKey('abc', 'abd') && !sameKey('', ''));
});
await test('the daily tidy removes day rows older than 400 days', async () => {
  _reset(); const env = ENV();
  await record(env.DB, clean({ id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed' }), Date.parse('2025-01-01T12:00:00Z'));
  await record(env.DB, clean({ id: ID(1), v: '2.56.0', device: 'ios', mode: 'installed' }), Date.parse('2026-11-01T12:00:00Z'));
  let job; await worker.scheduled({ scheduledTime: Date.parse('2026-11-05T00:00:00Z') }, env, { waitUntil: (p) => { job = p; } }); await job;
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM days').get().n, 1);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM installs').get().n, 1, 'the install itself is kept for “ever”');
});
console.log(passed + ' passed');
