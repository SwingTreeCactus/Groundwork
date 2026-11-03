/* Groundwork follow-up reminders — a Cloudflare Worker.
   Sends a morning push notification on days the person set a follow-up for. Nothing about any contact reaches it:
   each phone sends only the dates that have a follow-up, the reminder time and its time zone, under an anonymous
   random ID, plus the push address its browser gave it. The push it sends carries no names either; the phone
   writes "Follow-up today: Maria Lopez" itself from its own records.

   Settings → Variables and Secrets:
     VAPID_PUBLIC_KEY    (text)    the public key (base64url, 65 bytes), also set in the app's js/config.js
     VAPID_PRIVATE_KEY   (secret)  the private key (base64url, 32 bytes)
     ALLOWED_ORIGIN      (text)    https://mygroundwork.app
   Bindings → KV namespace:
     REMINDERS           a KV namespace for the subscriptions
   Settings → Triggers → Cron Triggers: add one that runs every 15 minutes.

   Routes (POST, JSON, only from ALLOWED_ORIGIN):
     /subscribe    { id, sub: {endpoint, keys: {p256dh, auth}}, tz, time: "HH:MM", dates: ["YYYY-MM-DD", ...] }
     /unsubscribe  { id }
*/
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DATES = 400;

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const concat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return { ok, headers: ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' } };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers) });

// A subscription as stored, or null if anything about it is off.
export function clean(b) {
  if (!b || !ID_RE.test(b.id || '')) return null;
  const sub = b.sub || {}, keys = sub.keys || {};
  let ep;
  try { ep = new URL(sub.endpoint); } catch (e) { return null; }
  if (ep.protocol !== 'https:' || String(sub.endpoint).length > 1000) return null;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(keys.p256dh || '') || !/^[A-Za-z0-9_-]{16,32}$/.test(keys.auth || '')) return null;
  if (!TIME_RE.test(b.time || '')) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: b.tz }); } catch (e) { return null; }
  if (!Array.isArray(b.dates) || b.dates.length > MAX_DATES || !b.dates.every((d) => DATE_RE.test(d))) return null;
  return { sub: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, tz: b.tz, time: b.time, dates: Array.from(new Set(b.dates)).sort(), sent: b.sent || null };
}

// The date and time where the person is ("2026-11-04", "08:15").
export function localNow(tz, now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  return { day: p.year + '-' + p.month + '-' + p.day, time: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute };
}
// Whether this subscription gets its reminder now: today is one of its dates, the reminder time has come, and
// today's has not been sent. Late runs still send the same day; nothing is sent for a day already past.
export function due(rec, now) {
  const l = localNow(rec.tz, now);
  return rec.dates.includes(l.day) && l.time >= rec.time && rec.sent !== l.day ? l.day : null;
}

// ---------- Web Push (RFC 8291 encryption, RFC 8292 VAPID) ----------
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
const hkdfExpand = async (prk, info, len) => (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len);

export async function encrypt(payload, p256dh, auth, salt, asKeys) {
  const uaPub = unb64u(p256dh), secret = unb64u(auth);
  const as = asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, as.privateKey, 256));
  const ikm = await hkdfExpand(await hmac(secret, shared), concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  salt = salt || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

async function vapidKey(env) {
  const pub = unb64u(env.VAPID_PUBLIC_KEY);
  const jwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
export async function vapidHeader(env, endpoint, now) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor((now || Date.now()) / 1000) + 12 * 3600, sub: 'https://mygroundwork.app' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), enc.encode(head + '.' + body));
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + env.VAPID_PUBLIC_KEY;
}
async function push(env, rec, payload) {
  const body = await encrypt(payload, rec.sub.keys.p256dh, rec.sub.keys.auth);
  return fetch(rec.sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(env, rec.sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '43200', Urgency: 'normal' },
    body,
  });
}

// One pass over everyone: send today's reminder where it is due; forget subscriptions the push service says are gone.
export async function run(env, now) {
  now = now || new Date();
  let cursor, sent = 0;
  do {
    const page = await env.REMINDERS.list({ prefix: 'u:', cursor });
    for (const k of page.keys) {
      const rec = await env.REMINDERS.get(k.name, 'json');
      if (!rec) continue;
      const day = due(rec, now);
      if (!day) continue;
      try {
        const r = await push(env, rec, JSON.stringify({ t: 'followup', day }));
        if (r.status === 404 || r.status === 410) { await env.REMINDERS.delete(k.name); continue; }
        if (r.ok) { rec.sent = day; await env.REMINDERS.put(k.name, JSON.stringify(rec)); sent++; }
      } catch (e) { /* try again next run */ }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return sent;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const c = cors(env, request.headers.get('Origin') || '');
    if (request.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    if (!c.ok) return json({ error: 'origin_not_allowed' }, 403, c.headers);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, c.headers);
    if (!env.REMINDERS || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return json({ error: 'not_configured' }, 500, c.headers);
    const raw = await request.text();
    if (raw.length > 20000) return json({ error: 'too_long' }, 413, c.headers);
    let b;
    try { b = JSON.parse(raw); } catch (e) { return json({ error: 'bad_request' }, 400, c.headers); }
    if (url.pathname === '/unsubscribe') {
      if (!b || !ID_RE.test(b.id || '')) return json({ error: 'bad_request' }, 400, c.headers);
      await env.REMINDERS.delete('u:' + b.id);
      return json({ ok: true }, 200, c.headers);
    }
    if (url.pathname !== '/subscribe') return json({ error: 'not_found' }, 404, c.headers);
    const rec = clean(b);
    if (!rec) return json({ error: 'bad_request' }, 400, c.headers);
    const old = await env.REMINDERS.get('u:' + b.id, 'json');
    rec.sent = old && old.sent ? old.sent : null; // a re-sync never re-sends today's reminder
    await env.REMINDERS.put('u:' + b.id, JSON.stringify(rec));
    return json({ ok: true }, 200, c.headers);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, new Date(event.scheduledTime || Date.now())));
  },
};
