// Run: node tests/ai-proxy.test.mjs   (the note cleanup helper, v2.30)
import assert from 'node:assert/strict';
import W from '../worker/ai-proxy.js';

const store = new Map();
const KV = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); } };
const env = { ANTHROPIC_API_KEY: 'sk-secret', ALLOWED_ORIGIN: 'https://mygroundwork.app', LIMITS: KV, DAILY_PER_INSTALL: '5', DAILY_TOTAL: '9' };
const O = 'https://mygroundwork.app', ID = 'abcdef0123456789abcdef0123456789';
let sent = [];
let reply = { status: 200, body: { id: 'msg', usage: { input_tokens: 9 }, content: [{ type: 'text', text: '{"note":"Hi."}' }] } };
globalThis.fetch = async (url, opts) => { sent.push({ url, headers: opts.headers, body: JSON.parse(opts.body) }); return new Response(JSON.stringify(reply.body), { status: reply.status }); };
const msg = (extra) => Object.assign({ model: 'claude-haiku-5-5', max_tokens: 4000, system: 'S', messages: [{ role: 'user', content: 'x' }] }, extra);
const req = (body, { origin = O, id = ID, path = '/v1/messages', e = env } = {}) => W.fetch(new Request('https://ai.example' + path, {
  method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, origin ? { Origin: origin } : {}, id ? { 'X-Groundwork-Install': id } : {}),
  body: typeof body === 'string' ? body : JSON.stringify(body) }), e);

let passed = 0;
async function test(name, fn) {
  sent = [];
  try { await fn(); passed++; console.log('  ok  ' + name); } catch (err) { console.error('FAIL  ' + name + '\n' + err.stack); process.exitCode = 1; }
}

await test('forwards to Claude with the key added; only text comes back', async () => {
  const r = await req(msg({ temperature: 1, tools: [{ name: 'x' }], max_tokens: 99999 }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), O);
  assert.deepEqual(await r.json(), { content: [{ type: 'text', text: '{"note":"Hi."}' }] });
  assert.equal(sent[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent[0].headers['x-api-key'], 'sk-secret');
  assert.deepEqual(Object.keys(sent[0].body).sort(), ['max_tokens', 'messages', 'model', 'system']);
  assert.equal(sent[0].body.max_tokens, 4000);
  assert.equal(r.headers.get('X-Groundwork-Left'), '4');
});
await test('another site is turned away', async () => {
  const r = await req(msg(), { origin: 'https://evil.example' });
  assert.equal(r.status, 403); assert.equal(sent.length, 0);
});
await test('no install ID, unknown model or other path: refused', async () => {
  assert.equal((await req(msg(), { id: '' })).status, 400);
  assert.equal((await req(msg({ model: 'claude-opus-5-5' }))).status, 400);
  assert.equal((await req(msg(), { path: '/v1/complete' })).status, 404);
  assert.equal((await req('x'.repeat(70000))).status, 413);
  assert.equal(sent.length, 0);
});
await test('per-install daily limit (Careful counts 4)', async () => {
  const r = await req(msg({ model: 'claude-sonnet-5-5' }));
  assert.equal(r.status, 200); // 1 + 4 = 5
  const r2 = await req(msg());
  assert.equal(r2.status, 429); assert.equal((await r2.json()).error, 'daily_limit');
});
await test('everyone-together daily limit', async () => {
  const other = 'zzzzzzzzzzzzzzzzzzzzzzzz';
  assert.equal((await req(msg({ model: 'claude-sonnet-5-5' }), { id: other })).status, 200); // total 9
  const r = await req(msg(), { id: 'yyyyyyyyyyyyyyyyyyyy' });
  assert.equal(r.status, 429); assert.equal((await r.json()).error, 'daily_total');
});
await test('Claude errors are not passed through, and do not count', async () => {
  store.clear(); reply = { status: 401, body: { error: { message: 'invalid x-api-key (org abc)' } } };
  const r = await req(msg());
  assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error: 'upstream_busy' });
  assert.equal(store.size, 0);
  reply = { status: 529, body: {} };
  assert.equal((await req(msg())).status, 503);
});
await test('not configured without the key or KV', async () => {
  assert.equal((await req(msg(), { e: Object.assign({}, env, { LIMITS: undefined }) })).status, 500);
});
await test('preflight allows the install header', async () => {
  const r = await W.fetch(new Request('https://ai.example/v1/messages', { method: 'OPTIONS', headers: { Origin: O } }), env);
  assert.equal(r.status, 204); assert.match(r.headers.get('Access-Control-Allow-Headers'), /X-Groundwork-Install/);
});
console.log(passed + ' passed');
