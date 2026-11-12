/* Service worker: caches the app so it opens with no signal.
   IMPORTANT: change CACHE (for example rvapp-v2) every time you publish a new version of any file,
   so phones pick up the update as one consistent set. */
const CACHE = 'rvapp-v127';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/space-grotesk-latin-400-normal.woff2',
  './fonts/space-grotesk-latin-500-normal.woff2',
  './fonts/space-grotesk-latin-700-normal.woff2',
  './js/util.js',
  './js/library.js',
  './js/topics.js',
  './js/defaults.js',
  './js/db.js',
  './js/logic.js',
  './js/service.js',
  './js/garden.js',
  './js/geo.js',
  './js/kinds.js',
  './js/plant.js',
  './js/config.js',
  './js/store.js',
  './js/drive.js',
  './js/ai.js',
  './js/notes.js',
  './js/smile.js',
  './js/ma.js',
  './js/ww.js',
  './js/handoff.js',
  './js/dom.js',
  './js/swipe.js',
  './js/ui-core.js',
  './js/nextvisit.js',
  './js/forms.js',
  './js/todaylist.js',
  './js/reminders.js',
  './js/stats.js',
  './js/screens.js',
  './js/calendar.js',
  './js/review.js',
  './js/critters.js',
  './js/insights.js',
  './js/gmap.js',
  './js/areas.js',
  './js/areaedit.js',
  './vendor/polygon-clipping/polygon-clipping.umd.min.js',
  './vendor/maplibre/maplibre-gl.js',
  './vendor/maplibre/maplibre-gl.css',
  './js/settings.js',
  './js/app.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon.svg',
  './icons/favicon.svg',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never stores old copies of files
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE && k !== 'gw-audio').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// v2.31: notes shared to Groundwork from another app (Android share sheet). They wait in a cache until the
// notes import screen opens and takes them.
const SHARE = 'rvapp-share';
// v2.54: the year in review's music lives in 'gw-audio' (filled by the page the first time it plays; kept across releases)
async function takeShare(req) {
  try {
    const form = await req.formData();
    const c = await caches.open(SHARE);
    let n = 0;
    const put = (name, blob) => c.put(new Request('./__share/' + Date.now() + '-' + (n++) + '?name=' + encodeURIComponent(name)), new Response(blob));
    for (const f of form.getAll('files')) if (f && typeof f === 'object' && f.size) await put(f.name || 'Shared note.txt', f);
    const text = [form.get('title'), form.get('text'), form.get('url')].filter((x) => typeof x === 'string' && x.trim()).join('\n\n');
    if (text) await put(((form.get('title') || 'Shared note') + '').slice(0, 60).replace(/[\\/]/g, '-') + '.txt', new Blob([text], { type: 'text/plain' }));
  } catch (e) { /* open the import screen anyway */ }
  return Response.redirect('./#/shared', 303); // v2.48: the app decides: a handoff opens it, anything else goes to the notes import
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) { event.respondWith(takeShare(req)); return; }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // maps, sign-in and other sites go straight to the network
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});

// v2.52: follow-up reminders. The push carries no names; this reads them from the phone's own records.
// v2.53: also the service time reminder: yesterday had visits recorded but no time.
const dstr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function pushInfo() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open('rvapp'); } catch (e) { return resolve({ names: [], missed: null }); }
    req.onerror = () => resolve({ names: [], missed: null });
    req.onsuccess = () => {
      const db = req.result;
      try {
        const d = new Date(), today = dstr(d);
        const t0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), y0 = t0 - 864e5;
        const yday = dstr(new Date(y0));
        const tx = db.transaction(['rvs', 'entries', 'lib', 'meta'], 'readonly');
        const rq = tx.objectStore('rvs').getAll(), eq = tx.objectStore('entries').getAll(), lq = tx.objectStore('lib').getAll(), mq = tx.objectStore('meta').get('settings');
        tx.oncomplete = () => {
          const ents = (eq.result || []).filter((e) => !e.deletedAt && (e.type === 'visit' || e.type === 'nh'));
          const done = new Set(ents.filter((e) => new Date(e.at).getTime() >= t0).map((e) => e.rvId));
          const rvs = rq.result || [];
          const names = rvs.filter((r) => !r.deletedAt && !r.archiveReason && r.snoozedUntil === today && !done.has(r.id) && !r.nextRemind).map((r) => r.name || 'Someone').sort();
          const inY = (iso) => { const t = new Date(iso).getTime(); return t >= y0 && t < t0; };
          const went = ents.some((e) => !e.imported && inY(e.at)) || rvs.some((r) => !r.deletedAt && !r.imported && r.createdAt && inY(r.createdAt));
          const timed = (lq.result || []).some((x) => x.kind === 'time' && !x.deletedAt && x.date === yday);
          const st = mq.result && mq.result.value, cleared = !!(st && st.service && st.service.cleared && st.service.cleared[yday]);
          // v2.54.1: the year in review, once, the morning after August's report was ticked Sent
          let review = null;
          try {
            const svm = (m) => (lq.result || []).find((x) => x.id === 'svm-' + m && !x.deletedAt);
            const y0s = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
            for (const y of [y0s, y0s - 1]) {
              const aug = svm((y + 1) + '-08'), sep = svm((y + 1) + '-09');
              if (!aug || !aug.sent || (sep && sep.sent)) continue;
              const rs = (st && st.service && st.service.review && st.service.review[y + '-09']) || {};
              const after = new Date(aug.sentAt || 0); after.setDate(after.getDate() + 1);
              if (!rs.watched && !rs.dismissed && aug.sentAt && dstr(after) === today) review = { s0: y + '-09', label: y + '–' + String(y + 1).slice(2) };
              break;
            }
          } catch (e) { review = null; }
          resolve({ names, missed: went && !timed && !cleared ? yday : null, review });
          db.close();
        };
        tx.onerror = () => { resolve({ names: [], missed: null }); db.close(); };
      } catch (e) { resolve({ names: [], missed: null }); }
    };
  });
}
function reminderText(names) { // the same words as RV.reminders.message
  const first = (n) => String(n || '').split(' ')[0];
  if (!names.length) return { title: 'Follow-ups today', body: 'Open Groundwork to see who.' };
  if (names.length === 1) return { title: 'Follow-up today', body: names[0] };
  if (names.length === 2) return { title: 'Follow-ups today', body: names[0] + ' and ' + names[1] };
  const f = names.map(first);
  return { title: names.length + ' follow-ups today', body: f.slice(0, -1).join(', ') + ' and ' + f[f.length - 1] };
}
// v2.57: a timed reminder for one next visit. The push says only when; the names come from this phone's records.
const pad2 = (n) => String(n).padStart(2, '0');
const fmt12 = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); if (!m) return ''; const hh = +m[1]; return (hh % 12 || 12) + ':' + m[2] + ' ' + (hh < 12 ? 'AM' : 'PM'); };
const LEAD = { at: 0, '15': 15, '30': 30, '60': 60, '120': 120 };
function remindAt(r) { // the same rule as RV.next.remindAt
  if (!r || !r.snoozedUntil || r.deletedAt || r.archiveReason) return null;
  const p = r.snoozedUntil.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
  if (r.nextRemind === 'daybefore') { d.setDate(d.getDate() - 1); return dstr(d) + 'T18:00'; }
  const m = /^(\d{2}):(\d{2})$/.exec(r.nextTime || '');
  if (!m || !(r.nextRemind in LEAD)) return null;
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2] - LEAD[r.nextRemind]);
  return dstr(at) + 'T' + pad2(at.getHours()) + ':' + pad2(at.getMinutes());
}
function rvsAt(at) {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open('rvapp'); } catch (e) { return resolve([]); }
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(['rvs', 'meta'], 'readonly'), rq = tx.objectStore('rvs').getAll(), mq = tx.objectStore('meta').get('settings');
        tx.oncomplete = () => { // v2.60: the maps app chosen in Settings › Directions rides along for the Directions button
          const st = (mq.result && mq.result.value) || {}, maps = st.maps || null;
          resolve((rq.result || []).filter((r) => remindAt(r) === at).map((r) => Object.assign({}, r, { maps })));
          db.close();
        };
        tx.onerror = () => { resolve([]); db.close(); };
      } catch (e) { resolve([]); }
    };
  });
}
function timedNote(at) {
  return rvsAt(at).then((rvs) => {
    if (!rvs.length) return null;
    const today = dstr(new Date());
    const when = (r) => (r.snoozedUntil === today ? '' : 'Tomorrow ') + (r.nextTime ? 'at ' + fmt12(r.nextTime) : '');
    if (rvs.length > 1) return self.registration.showNotification(rvs.length + ' next visits', { body: rvs.map((r) => (r.name || 'Someone').split(' ')[0] + ' ' + when(r)).join(' · '),
      icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'nv-' + at, data: { url: './#/home' } });
    const r = rvs[0];
    const body = [r.whatsNext, [r.address, r.neighborhood].filter(Boolean).join(' · ')].filter(Boolean).join('\n') || 'Next visit';
    return self.registration.showNotification((r.name || 'Next visit') + ' ' + when(r), { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'nv-' + r.id,
      actions: [{ action: 'tomorrow', title: 'Tomorrow' }, { action: 'dir', title: 'Directions' }],
      data: { url: './#/rv/' + r.id, id: r.id, address: r.address || '', geo: r.geo || null, maps: r.maps || null } });
  });
}
// Tomorrow from the notification: the open app moves it (so its own copy stays current); otherwise it's written here.
function moveTomorrow(id) {
  const t = new Date(); t.setDate(t.getDate() + 1);
  const ds = dstr(t);
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    if (cs.length) { cs.forEach((c) => c.postMessage({ type: 'nv-move', id, date: ds })); return; }
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('rvapp'); } catch (e) { return resolve(); }
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('rvs', 'readwrite'), st = tx.objectStore('rvs'), g = st.get(id);
          g.onsuccess = () => { const r = g.result; if (r) { r.snoozedUntil = ds; r.updatedAt = new Date().toISOString(); st.put(r); } };
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); resolve(); };
        } catch (e) { resolve(); }
      };
    });
  });
}
function mapsUrl(d) { // the app chosen in Settings › Directions; not chosen or Ask each time: Apple Maps on Apple devices, else Google Maps
  const q = d.geo && d.geo.lat != null ? d.geo.lat + ',' + d.geo.lng : d.address;
  const apple = /iPhone|iPad|Macintosh/.test(self.navigator.userAgent || '');
  const app = d.maps === 'google' || d.maps === 'waze' || (d.maps === 'apple' && apple) ? d.maps : apple ? 'apple' : 'google';
  if (app === 'waze') return 'https://waze.com/ul?navigate=yes&' + (d.geo && d.geo.lat != null ? 'll=' + q : 'q=' + encodeURIComponent(q));
  if (app === 'apple') return 'https://maps.apple.com/?daddr=' + encodeURIComponent(q);
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
}
self.addEventListener('push', (event) => {
  let data = null;
  try { data = event.data ? event.data.json() : null; } catch (e) { data = null; }
  if (data && data.t === 'timed' && data.at) { event.waitUntil(timedNote(data.at)); return; }
  event.waitUntil(pushInfo().then(({ names, missed, review }) => {
    const ask = 'Any time from yesterday to add?';
    let m, url = './#/home';
    if (missed && !names.length) { m = { title: 'Service time', body: ask }; url = './#/calendar'; }
    else { m = reminderText(names); if (missed) m.body += ' · ' + ask; }
    if (review) {
      const line = 'Your ' + review.label + ' year in review is ready.';
      if (!names.length && !missed) { m = { title: 'Groundwork', body: line }; url = './#/calendar/review/' + review.s0; } else m.body += ' · ' + line;
    }
    return self.registration.showNotification(m.title, { body: m.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'followups', data: { url } });
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  if (event.action === 'tomorrow' && d.id) { event.waitUntil(moveTomorrow(d.id)); return; }
  if (event.action === 'dir' && (d.address || d.geo)) { event.waitUntil(self.clients.openWindow(mapsUrl(d))); return; }
  const url = new URL((event.notification.data && event.notification.data.url) || './#/home', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.registration.scope));
    if (c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
