/* Service worker: caches the app so it opens with no signal.
   IMPORTANT: change CACHE (for example rvapp-v2) every time you publish a new version of any file,
   so phones pick up the update as one consistent set. */
const CACHE = 'rvapp-v113';
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
  './js/ui-core.js',
  './js/forms.js',
  './js/todaylist.js',
  './js/reminders.js',
  './js/screens.js',
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// v2.31: notes shared to Groundwork from another app (Android share sheet). They wait in a cache until the
// notes import screen opens and takes them.
const SHARE = 'rvapp-share';
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
function followUpsToday() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open('rvapp'); } catch (e) { return resolve([]); }
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const t0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const tx = db.transaction(['rvs', 'entries'], 'readonly');
        const rq = tx.objectStore('rvs').getAll(), eq = tx.objectStore('entries').getAll();
        tx.oncomplete = () => {
          const done = new Set((eq.result || []).filter((e) => !e.deletedAt && (e.type === 'visit' || e.type === 'nh') && new Date(e.at).getTime() >= t0).map((e) => e.rvId));
          resolve((rq.result || []).filter((r) => !r.deletedAt && !r.archiveReason && r.snoozedUntil === today && !done.has(r.id)).map((r) => r.name || 'Someone').sort());
          db.close();
        };
        tx.onerror = () => { resolve([]); db.close(); };
      } catch (e) { resolve([]); }
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
self.addEventListener('push', (event) => {
  event.waitUntil(followUpsToday().then((names) => {
    const m = reminderText(names);
    return self.registration.showNotification(m.title, { body: m.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'followups', data: { url: './#/home' } });
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './#/home', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.registration.scope));
    if (c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
