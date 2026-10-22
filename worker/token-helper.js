/* Groundwork sign-in helper — a Cloudflare Worker.
   Google only hands out a lasting "renewal key" (refresh token) to a server that can show the app's client
   secret. This Worker is that server, and nothing more: it swaps a sign-in code for keys, and a renewal key
   for a fresh hour of access. It stores nothing and logs nothing; the renewal key lives only on the user's device.

   Settings → Variables and Secrets:
     GOOGLE_CLIENT_ID      (text)    the OAuth Web client ID
     GOOGLE_CLIENT_SECRET  (secret)  that client's secret
     ALLOWED_ORIGIN        (text)    https://mygroundwork.app
*/
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    ok,
    headers: ok ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    } : { Vary: 'Origin' },
  };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers) });

async function google(env, params) {
  const body = new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }, params));
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  let j = {}; try { j = await res.json(); } catch (e) { /* ignore */ }
  return { ok: res.ok, status: res.status, j };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const c = cors(env, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    if (!c.ok) return json({ error: 'origin_not_allowed' }, 403, c.headers);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, c.headers);
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: 'not_configured' }, 500, c.headers);
    let b = {};
    try { b = await request.json(); } catch (e) { return json({ error: 'bad_request' }, 400, c.headers); }

    if (url.pathname === '/exchange') {
      // the code must come back to the app's own address
      if (typeof b.code !== 'string' || typeof b.redirect_uri !== 'string' || new URL(b.redirect_uri, 'https://x').origin !== origin) return json({ error: 'bad_request' }, 400, c.headers);
      const r = await google(env, { grant_type: 'authorization_code', code: b.code, redirect_uri: b.redirect_uri });
      if (!r.ok) return json({ error: r.j.error || 'exchange_failed' }, r.status === 400 ? 400 : 502, c.headers);
      return json({ access_token: r.j.access_token, expires_in: r.j.expires_in, refresh_token: r.j.refresh_token }, 200, c.headers);
    }
    if (url.pathname === '/refresh') {
      if (typeof b.refresh_token !== 'string') return json({ error: 'bad_request' }, 400, c.headers);
      const r = await google(env, { grant_type: 'refresh_token', refresh_token: b.refresh_token });
      if (!r.ok) return json({ error: r.j.error || 'refresh_failed' }, r.status === 400 ? 400 : 502, c.headers);
      return json({ access_token: r.j.access_token, expires_in: r.j.expires_in }, 200, c.headers);
    }
    if (url.pathname === '/revoke') {
      if (typeof b.token !== 'string') return json({ error: 'bad_request' }, 400, c.headers);
      await fetch(REVOKE_URL + '?token=' + encodeURIComponent(b.token), { method: 'POST' });
      return json({ ok: true }, 200, c.headers);
    }
    return json({ error: 'not_found' }, 404, c.headers);
  },
};
