/* Groundwork note cleanup helper — a Cloudflare Worker.
   Holds one Anthropic API key so everyone using the app can tidy notes with Claude without a key of their own.
   It only passes note text to Claude's Messages API and the reply back. It stores no note text and logs nothing;
   the only thing it keeps is a daily count per install (an anonymous random ID) so one person can't use up the credit.

   Settings → Variables and Secrets:
     ANTHROPIC_API_KEY   (secret)  the API key from platform.claude.com
     ALLOWED_ORIGIN      (text)    https://mygroundwork.app
     DAILY_PER_INSTALL   (text, optional)  units per install per day, default 60
     DAILY_TOTAL         (text, optional)  units for everyone per day, default 600
   Bindings → KV namespace:
     LIMITS              a KV namespace for the daily counts
   A Fast (Haiku) request is 1 unit, a Careful (Sonnet) request is 4.
*/
const API = 'https://api.anthropic.com/v1/messages';
const MODELS = { 'claude-haiku-5-5': 1, 'claude-sonnet-5-5': 4 };
const MAX_TOKENS = 4000;
const MAX_BODY = 60000; // characters of request body
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    ok,
    headers: ok ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Groundwork-Install',
      'Access-Control-Expose-Headers': 'X-Groundwork-Left',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    } : { Vary: 'Origin' },
  };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers) });
const num = (v, d) => { const n = parseInt(v, 10); return n > 0 ? n : d; };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const c = cors(env, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    if (!c.ok) return json({ error: 'origin_not_allowed' }, 403, c.headers);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, c.headers);
    if (url.pathname !== '/v1/messages') return json({ error: 'not_found' }, 404, c.headers);
    if (!env.ANTHROPIC_API_KEY || !env.LIMITS) return json({ error: 'not_configured' }, 500, c.headers);

    const install = request.headers.get('X-Groundwork-Install') || '';
    if (!ID_RE.test(install)) return json({ error: 'bad_request' }, 400, c.headers);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_long' }, 413, c.headers);
    let b;
    try { b = JSON.parse(raw); } catch (e) { return json({ error: 'bad_request' }, 400, c.headers); }
    const cost = MODELS[b && b.model];
    if (!cost || !Array.isArray(b.messages) || !b.messages.length) return json({ error: 'bad_request' }, 400, c.headers);

    // daily counts (KV is eventually consistent, so these are soft limits; the Console spend limit is the hard one)
    const day = new Date().toISOString().slice(0, 10);
    const kMine = 'd:' + day + ':' + install, kAll = 't:' + day;
    const [mine, all] = await Promise.all([env.LIMITS.get(kMine), env.LIMITS.get(kAll)]);
    const usedMine = num(mine, 0), usedAll = num(all, 0);
    if (usedMine + cost > num(env.DAILY_PER_INSTALL, 60)) return json({ error: 'daily_limit' }, 429, c.headers);
    if (usedAll + cost > num(env.DAILY_TOTAL, 600)) return json({ error: 'daily_total' }, 429, c.headers);

    // only the fields Groundwork uses go through
    const body = { model: b.model, max_tokens: Math.min(num(b.max_tokens, MAX_TOKENS), MAX_TOKENS), messages: b.messages };
    if (typeof b.system === 'string') body.system = b.system;
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
    } catch (e) { return json({ error: 'upstream_unreachable' }, 502, c.headers); }
    let j = {};
    try { j = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      // never pass Anthropic's message (it can name the account) back; just the kind of failure
      const status = res.status === 429 || res.status === 529 ? 503 : res.status === 400 ? 400 : 502;
      const type = j && j.error && typeof j.error.type === 'string' ? j.error.type : '';
      console.log('anthropic', res.status, type);
      return json({ error: res.status === 400 ? 'bad_request' : 'upstream_busy', upstream: res.status, type }, status, c.headers);
    }
    const ttl = { expirationTtl: 60 * 60 * 48 };
    await Promise.all([env.LIMITS.put(kMine, String(usedMine + cost), ttl), env.LIMITS.put(kAll, String(usedAll + cost), ttl)]);
    return json({ content: (j.content || []).filter((x) => x.type === 'text').map((x) => ({ type: 'text', text: x.text })) }, 200,
      Object.assign({ 'X-Groundwork-Left': String(Math.max(0, num(env.DAILY_PER_INSTALL, 60) - usedMine - cost)) }, c.headers));
  },
};
