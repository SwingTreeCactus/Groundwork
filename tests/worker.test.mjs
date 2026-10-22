// Run: node tests/worker.test.mjs   (the sign-in helper, v2.20)
import assert from 'node:assert/strict';
import W from '../worker/token-helper.js';

const env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', ALLOWED_ORIGIN: 'https://mygroundwork.app' };
const O = 'https://mygroundwork.app';
let sent = [];
let reply = { status: 200, body: { access_token: 'AT', expires_in: 3599, refresh_token: 'RT', scope: 'x', id_token: 'nope' } };
globalThis.fetch = async (url, opts) => { sent.push({ url, body: String(opts.body || '') }); return new Response(JSON.stringify(reply.body), { status: reply.status }); };
const req = (path, body, origin = O, method = 'POST') => W.fetch(new Request('https://helper.example' + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, origin ? { Origin: origin } : {}), body: method === 'POST' ? JSON.stringify(body) : undefined }), env);

let passed = 0;
async function test(name, fn) {
  sent = [];
  try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n' + e.stack); process.exitCode = 1; }
}

await test('exchange: code for keys, secret added, only the keys returned', async () => {
  const r = await req('/exchange', { code: 'C1', redirect_uri: O + '/' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), O);
  assert.deepEqual(await r.json(), { access_token: 'AT', expires_in: 3599, refresh_token: 'RT' });
  const p = new URLSearchParams(sent[0].body);
  assert.equal(sent[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(p.get('grant_type'), 'authorization_code'); assert.equal(p.get('client_secret'), 'sec'); assert.equal(p.get('code'), 'C1');
});
await test('refresh: renewal key for an hour', async () => {
  const r = await req('/refresh', { refresh_token: 'RT' });
  const j = await r.json();
  assert.equal(j.access_token, 'AT'); assert.equal(j.refresh_token, undefined);
  assert.equal(new URLSearchParams(sent[0].body).get('grant_type'), 'refresh_token');
});
await test('another site is turned away', async () => {
  const r = await req('/refresh', { refresh_token: 'RT' }, 'https://evil.example');
  assert.equal(r.status, 403); assert.equal(sent.length, 0);
});
await test('redirect must be the app itself', async () => {
  const r = await req('/exchange', { code: 'C', redirect_uri: 'https://evil.example/' });
  assert.equal(r.status, 400); assert.equal(sent.length, 0);
});
await test('preflight allowed for the app', async () => {
  const r = await W.fetch(new Request('https://helper.example/refresh', { method: 'OPTIONS', headers: { Origin: O } }), env);
  assert.equal(r.status, 204); assert.match(r.headers.get('Access-Control-Allow-Methods'), /POST/);
});
await test('revoked key: invalid_grant passed back', async () => {
  reply = { status: 400, body: { error: 'invalid_grant' } };
  const r = await req('/refresh', { refresh_token: 'old' });
  assert.equal(r.status, 400); assert.equal((await r.json()).error, 'invalid_grant');
});
console.log(passed + ' passed');
