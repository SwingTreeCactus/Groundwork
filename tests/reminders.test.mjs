// Run: node tests/reminders.test.mjs   (the follow-up reminders Worker, v2.52)
import assert from 'node:assert/strict';
import worker, { clean, localNow, due, encrypt, vapidHeader, run } from '../worker/reminders.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const subtle = crypto.subtle;

// a browser's push keys, made here so the test can decrypt what the Worker sends
const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const SUB = { endpoint: 'https://push.example.com/send/abc123', keys: { p256dh: b64u(uaPub), auth: b64u(authSecret) } };
// a VAPID key pair as the Worker's variables hold it
const vk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vjwk = await subtle.exportKey('jwk', vk.privateKey);
const vpub = new Uint8Array(await subtle.exportKey('raw', vk.publicKey));
const kv = () => { const m = new Map(); return { m,
  get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
  put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); },
  list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) }; };
const ENV = () => ({ VAPID_PUBLIC_KEY: b64u(vpub), VAPID_PRIVATE_KEY: vjwk.d, ALLOWED_ORIGIN: 'https://mygroundwork.app', REMINDERS: kv() });
const ID = 'a1b2c3d4e5f60718a1b2c3d4e5f60718';
const body = (o) => JSON.stringify(Object.assign({ id: ID, sub: SUB, tz: 'America/Los_Angeles', time: '08:00', dates: ['2026-11-04'] }, o));
const req = (path, b, origin = 'https://mygroundwork.app') => new Request('https://r.example' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: b });

async function hmac(key, data) { const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await subtle.sign('HMAC', k, data)); }
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const te = new TextEncoder();
async function decrypt(buf) {
  const salt = buf.slice(0, 16), idlen = buf[20], asPub = buf.slice(21, 21 + idlen), ct = buf.slice(21 + idlen);
  const as = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: as }, ua.privateKey, 256));
  const ikm = (await hmac(await hmac(authSecret, shared), cat(te.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])))).slice(0, 32);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const k = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, ct));
  assert.equal(pt[pt.length - 1], 2);
  return new TextDecoder().decode(pt.slice(0, -1));
}

await test('a subscription keeps only push keys, time, time zone and dates; anything off is refused', () => {
  const r = clean(JSON.parse(body({ name: 'Maria', dates: ['2026-11-04', '2026-11-04', '2026-11-02'] })));
  assert.deepEqual(Object.keys(r).sort(), ['dates', 'sent', 'sub', 'time', 'tz']);
  assert.deepEqual(r.dates, ['2026-11-02', '2026-11-04']);
  assert.equal(clean(JSON.parse(body({ id: 'x' }))), null);
  assert.equal(clean(JSON.parse(body({ time: '25:00' }))), null);
  assert.equal(clean(JSON.parse(body({ tz: 'Mars/Base' }))), null);
  assert.equal(clean(JSON.parse(body({ dates: ['Nov 4'] }))), null);
  assert.equal(clean(JSON.parse(body({ sub: { endpoint: 'http://insecure', keys: SUB.keys } }))), null);
});
await test('due: only on a follow-up day, from the chosen time, once', () => {
  const rec = clean(JSON.parse(body()));
  assert.deepEqual(localNow('America/Los_Angeles', new Date('2026-11-04T15:30:00Z')), { day: '2026-11-04', time: '07:30' });
  assert.equal(due(rec, new Date('2026-11-04T15:30:00Z')), null);            // 7:30, before 8:00
  assert.equal(due(rec, new Date('2026-11-04T16:15:00Z')), '2026-11-04');    // 8:15
  assert.equal(due(Object.assign({}, rec, { sent: '2026-11-04' }), new Date('2026-11-04T18:00:00Z')), null);
  assert.equal(due(rec, new Date('2026-11-05T16:15:00Z')), null);            // no follow-up that day: nothing
});
await test('the push is encrypted for that browser (RFC 8291) and decrypts to no names', async () => {
  const out = await encrypt(JSON.stringify({ t: 'followup', day: '2026-11-04' }), SUB.keys.p256dh, SUB.keys.auth);
  assert.equal(JSON.parse(await decrypt(out)).t, 'followup');
});
await test('the VAPID header is a signed ES256 token for the push service', async () => {
  const env = ENV();
  const hdr = await vapidHeader(env, SUB.endpoint, Date.UTC(2026, 10, 4));
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(hdr);
  assert.ok(m); assert.equal(m[4], env.VAPID_PUBLIC_KEY);
  assert.equal(JSON.parse(Buffer.from(m[2], 'base64url')).aud, 'https://push.example.com');
  assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk.publicKey, unb64u(m[3]), te.encode(m[1] + '.' + m[2])));
});
await test('subscribe, then the cron sends once on the day; a gone subscription is forgotten', async () => {
  const env = ENV();
  assert.equal((await worker.fetch(req('/subscribe', body(), 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(req('/subscribe', body({ id: '!' })), env)).status, 400);
  assert.equal((await worker.fetch(req('/subscribe', body()), env)).status, 200);
  const sentTo = [];
  globalThis.fetch = async (url, o) => { sentTo.push({ url, o }); return new Response(null, { status: 201 }); };
  assert.equal(await run(env, new Date('2026-11-04T16:15:00Z')), 1);
  assert.equal(sentTo[0].url, SUB.endpoint); assert.equal(sentTo[0].o.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(await run(env, new Date('2026-11-04T16:30:00Z')), 0);   // once a day
  await worker.fetch(req('/subscribe', body({ dates: ['2026-11-04', '2026-11-09'] })), env);
  assert.equal(await run(env, new Date('2026-11-04T17:00:00Z')), 0);   // a re-sync doesn't re-send today
  assert.equal(await run(env, new Date('2026-11-05T17:00:00Z')), 0);   // no follow-up: no push
  globalThis.fetch = async () => new Response(null, { status: 410 });
  assert.equal(await run(env, new Date('2026-11-09T17:00:00Z')), 0);
  assert.equal(env.REMINDERS.m.size, 0);
});
await test('unsubscribe removes it', async () => {
  const env = ENV();
  await worker.fetch(req('/subscribe', body()), env);
  assert.equal((await worker.fetch(req('/unsubscribe', JSON.stringify({ id: ID })), env)).status, 200);
  assert.equal(env.REMINDERS.m.size, 0);
});
console.log(passed + ' passed');
