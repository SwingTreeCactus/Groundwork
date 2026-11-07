/* Groundwork usage stats — a Cloudflare Worker with a D1 database (v2.56).
   Each install checks in at most once a day with an anonymous random code (the same one Note cleanup uses), the app
   version, the kind of device, whether it runs installed or in a browser, and which features are switched on.
   Nothing else: no names, notes, addresses, contacts, counts of contacts, or IP addresses are stored. The stats
   page (this Worker's own address) shows the counts and opens only with the admin key.

   Setup (Cloudflare dashboard):
     Storage & Databases → D1 → Create database: groundwork-stats
     Workers → Create → groundwork-stats, paste this file, Deploy
     Its Bindings → D1 database, variable name DB, the database above
     Variables and Secrets: ALLOWED_ORIGIN (text) = https://mygroundwork.app; ADMIN_KEY (secret) = a long password
       only you know (it opens the stats page)
     Settings → Triggers → Cron Triggers: once a day (tidies records older than 400 days)
   The tables are made on the first request.

   Routes:
     POST /ping         { id, v, device: ios|android|desktop, mode: installed|browser, f: [features] }  (ALLOWED_ORIGIN only)
     GET  /             the stats page (no data in it)
     GET  /api/summary  the numbers, with header Authorization: Bearer <ADMIN_KEY>
*/
export const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const VER_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
export const DEVICES = ['ios', 'android', 'desktop'];
export const MODES = ['installed', 'browser'];
export const FEATURES = ['garden', 'calendar', 'drive', 'reminders', 'cleanup', 'visits'];
const KEEP_DAYS = 400;

const json = (body, status, headers) => new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers || {}) });
function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return { ok, headers: ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' } };
}
export const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (ds, n) => dayOf(Date.parse(ds + 'T00:00:00Z') + n * 864e5);

// A check-in as stored, or null if anything about it is off.
export function clean(b) {
  if (!b || typeof b !== 'object' || !ID_RE.test(b.id || '')) return null;
  const v = VER_RE.test(b.v || '') ? b.v : null;
  const device = DEVICES.includes(b.device) ? b.device : null;
  const mode = MODES.includes(b.mode) ? b.mode : null;
  if (!v || !device || !mode) return null;
  const f = Array.isArray(b.f) ? FEATURES.filter((x) => b.f.includes(x)) : [];
  return { id: b.id, v, device, mode, f: f.join(',') };
}

let ready = null;
export function setup(db) {
  if (!ready) ready = db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS installs (id TEXT PRIMARY KEY, first TEXT NOT NULL, last TEXT NOT NULL, v TEXT, device TEXT, mode TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS days (day TEXT NOT NULL, id TEXT NOT NULL, v TEXT, device TEXT, mode TEXT, f TEXT, PRIMARY KEY (day, id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS days_day ON days (day)'),
    db.prepare('CREATE INDEX IF NOT EXISTS installs_first ON installs (first)'),
  ]).catch((e) => { ready = null; throw e; });
  return ready;
}
export const _reset = () => { ready = null; };

// One row per install, one row per install per day: two rows written a day per install at most.
export async function record(db, rec, now) {
  await setup(db);
  const day = dayOf(now || Date.now());
  await db.batch([
    db.prepare('INSERT INTO installs (id, first, last, v, device, mode) VALUES (?1, ?2, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET last = ?2, v = ?3, device = ?4, mode = ?5 WHERE installs.last < ?2 OR installs.v IS NOT ?3')
      .bind(rec.id, day, rec.v, rec.device, rec.mode),
    db.prepare('INSERT INTO days (day, id, v, device, mode, f) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(day, id) DO UPDATE SET v = ?3, device = ?4, mode = ?5, f = ?6')
      .bind(day, rec.id, rec.v, rec.device, rec.mode, rec.f),
  ]);
}

export async function summary(db, now) {
  await setup(db);
  const today = dayOf(now || Date.now()), d7 = addDays(today, -6), d30 = addDays(today, -29), d60 = addDays(today, -59);
  const one = async (sql, ...args) => (await db.prepare(sql).bind(...args).first()) || {};
  const all = async (sql, ...args) => ((await db.prepare(sql).bind(...args).all()).results || []);
  const ever = (await one('SELECT COUNT(*) AS n FROM installs')).n || 0;
  const active = async (from) => (await one('SELECT COUNT(DISTINCT id) AS n FROM days WHERE day >= ?1', from)).n || 0;
  const fresh = async (from) => (await one('SELECT COUNT(*) AS n FROM installs WHERE first >= ?1', from)).n || 0;
  const daily = await all('SELECT day, COUNT(*) AS n FROM days WHERE day >= ?1 GROUP BY day ORDER BY day', d60);
  const newDaily = await all('SELECT first AS day, COUNT(*) AS n FROM installs WHERE first >= ?1 GROUP BY first ORDER BY first', d60);
  // the last check-in of each install active in the last 30 days
  const last30 = await all('SELECT v, device, mode FROM installs WHERE last >= ?1', d30);
  const count = (key) => { const m = {}; last30.forEach((r) => { const k = r[key] || '?'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })); };
  const fRows = await all('SELECT d.f AS f FROM days d JOIN (SELECT id, MAX(day) AS day FROM days WHERE day >= ?1 GROUP BY id) l ON l.id = d.id AND l.day = d.day', d30);
  const features = FEATURES.map((k) => ({ k, n: fRows.filter((r) => String(r.f || '').split(',').includes(k)).length }));
  const byDay = new Map(daily.map((r) => [r.day, r.n])), byNew = new Map(newDaily.map((r) => [r.day, r.n]));
  const series = [];
  for (let i = 59; i >= 0; i--) { const d = addDays(today, -i); series.push({ day: d, active: byDay.get(d) || 0, new: byNew.get(d) || 0 }); }
  return {
    today, ever,
    active: { day: await active(today), week: await active(d7), month: await active(d30) },
    new: { week: await fresh(d7), month: await fresh(d30) },
    series, versions: count('v'), devices: count('device'), modes: count('mode'), features, base: last30.length,
  };
}

// constant-time comparison for the admin key
export function sameKey(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ping') {
      const c = cors(env, request.headers.get('Origin') || '');
      if (request.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
      if (!c.ok) return json({ error: 'origin_not_allowed' }, 403, c.headers);
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, c.headers);
      if (!env.DB) return json({ error: 'not_configured' }, 500, c.headers);
      const raw = await request.text();
      if (raw.length > 2000) return json({ error: 'too_long' }, 413, c.headers);
      let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: 'bad_request' }, 400, c.headers); }
      const rec = clean(b);
      if (!rec) return json({ error: 'bad_request' }, 400, c.headers);
      await record(env.DB, rec);
      return json({ ok: true }, 200, c.headers);
    }
    if (url.pathname === '/api/summary') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      const key = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!env.ADMIN_KEY || !sameKey(key, env.ADMIN_KEY)) return json({ error: 'unauthorized' }, 401);
      if (!env.DB) return json({ error: 'not_configured' }, 500);
      return json(await summary(env.DB));
    }
    if (url.pathname === '/' && request.method === 'GET') return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:" } });
    return json({ error: 'not_found' }, 404);
  },
  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil((async () => {
      await setup(env.DB);
      const cut = addDays(dayOf(event.scheduledTime || Date.now()), -KEEP_DAYS);
      await env.DB.prepare('DELETE FROM days WHERE day < ?1').bind(cut).run();
    })());
  },
};

// The stats page: asks for the admin key once (kept in this browser), then shows the numbers. No data is in the page.
export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Groundwork stats</title>
<style>
:root{--paper:#F2EEE5;--card:#FFFDF9;--ink:#1F1D1A;--muted:#6E6A62;--line:#E6E0D4;--green:#3F6B48;--mead:#BFD3B3}
@media (prefers-color-scheme:dark){:root{--paper:#151412;--card:#211F1C;--ink:#ECE7DD;--muted:#9E998F;--line:#33302B;--green:#9CCB95;--mead:#3E5546}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:20px 16px 40px;display:flex;flex-direction:column;gap:14px}
h1{font-size:28px;margin:4px 0 0;letter-spacing:-.02em}.sub{color:var(--muted);font-size:14px}
.card{background:var(--card);border-radius:18px;padding:16px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.st{background:var(--card);border-radius:16px;padding:14px}.st b{display:block;font-size:30px;letter-spacing:-.03em}.st span{color:var(--muted);font-size:13px}
h2{font-size:15px;margin:0 0 10px}
.chart{display:flex;align-items:flex-end;gap:2px;height:120px}.chart i{flex:1;background:var(--green);border-radius:3px 3px 0 0;min-height:1px}
.chart.new i{background:var(--mead)}.axis{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin-top:6px}
.row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:15px}.row:first-of-type{border-top:0}
.row .k{flex:0 0 120px}.row .bar{flex:1;height:10px;background:var(--line);border-radius:5px;overflow:hidden}.row .bar i{display:block;height:100%;background:var(--green)}
.row .n{flex:0 0 92px;white-space:nowrap;text-align:right;color:var(--muted)}
form{display:flex;gap:8px}input{flex:1;font:inherit;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
button{font:inherit;font-weight:600;border:0;border-radius:12px;padding:12px 16px;background:var(--green);color:#fff;cursor:pointer}
.link{background:none;color:var(--muted);padding:0;font-weight:400;text-decoration:underline}
.err{color:#B4583A}
</style></head><body><main>
<div><h1>Groundwork stats</h1><div class="sub" id="sub">Anonymous installs. Each install checks in at most once a day.</div></div>
<div id="app"></div>
</main><script>
(function(){
var app=document.getElementById('app'),sub=document.getElementById('sub');
var KEY='gwstats.key';
function el(t,a,c){var e=document.createElement(t);if(a)for(var k in a){if(k==='text')e.textContent=a[k];else e.setAttribute(k,a[k]);}(c||[]).forEach(function(x){if(x)e.appendChild(x);});return e;}
function ask(msg){app.replaceChildren();var i=el('input',{type:'password',placeholder:'Admin key',autocomplete:'current-password','aria-label':'Admin key'});
var f=el('form',null,[i,el('button',{type:'submit',text:'Open'})]);f.onsubmit=function(e){e.preventDefault();try{localStorage.setItem(KEY,i.value);}catch(x){}load();};
app.append(el('div',{class:'card'},[msg?el('p',{class:'err',text:msg}):null,f]));}
function stat(n,l){return el('div',{class:'st'},[el('b',{text:String(n)}),el('span',{text:l})]);}
function bars(list,total,names){var c=el('div',{class:'card'});list.forEach(function(r){var p=total?Math.round(r.n/total*100):0;var bar=el('span',{class:'bar'},[el('i',{style:'width:'+p+'%'})]);
c.append(el('div',{class:'row'},[el('span',{class:'k',text:(names&&names[r.k])||r.k}),bar,el('span',{class:'n',text:r.n+' · '+p+'%'})]));});return c;}
function chart(series,key,cls){var max=Math.max(1,Math.max.apply(null,series.map(function(s){return s[key];})));
var c=el('div',{class:'chart'+(cls?' '+cls:'')});series.forEach(function(s){c.append(el('i',{style:'height:'+Math.round(s[key]/max*100)+'%',title:s.day+': '+s[key]}));});
return el('div',null,[c,el('div',{class:'axis'},[el('span',{text:series[0].day}),el('span',{text:'max '+max}),el('span',{text:series[series.length-1].day})])]);}
var NAMES={ios:'iPhone',android:'Android',desktop:'Computer',installed:'Installed',browser:'In a browser',garden:'Garden on',calendar:'Calendar set up',drive:'Drive backup',reminders:'Reminders on',cleanup:'Clean up used',visits:'Visits this week'};
function show(d){sub.textContent='Anonymous installs, as of '+d.today+' (UTC). Each install checks in at most once a day.';
app.replaceChildren(
el('div',{class:'grid'},[stat(d.active.day,'active today'),stat(d.active.week,'active this week'),stat(d.active.month,'active in 30 days')]),
el('div',{class:'grid'},[stat(d.ever,'installs ever'),stat(d.new.week,'new this week'),stat(d.new.month,'new in 30 days')]),
el('div',{class:'card'},[el('h2',{text:'Active each day, last 60 days'}),chart(d.series,'active')]),
el('div',{class:'card'},[el('h2',{text:'New installs each day'}),chart(d.series,'new','new')]),
el('h2',{text:'Versions (active in 30 days)'}),bars(d.versions,d.base),
el('h2',{text:'Devices'}),bars(d.devices,d.base,NAMES),bars(d.modes,d.base,NAMES),
el('h2',{text:'Features (active in 30 days)'}),bars(d.features,d.base,NAMES),
(function(){var b=el('button',{class:'link',type:'button',text:'Forget the key on this browser'});b.onclick=function(){try{localStorage.removeItem(KEY);}catch(x){}ask();};return b;})());}
function load(){var k='';try{k=localStorage.getItem(KEY)||'';}catch(x){}if(!k)return ask();
app.replaceChildren(el('div',{class:'sub',text:'Loading…'}));
fetch('/api/summary',{headers:{Authorization:'Bearer '+k}}).then(function(r){if(r.status===401){try{localStorage.removeItem(KEY);}catch(x){}ask('That key didn’t work.');return null;}return r.json();})
.then(function(d){if(d)show(d);}).catch(function(){ask('Couldn’t load the stats. Check the connection.');});}
load();})();
</script></body></html>`;
