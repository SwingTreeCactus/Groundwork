/* Service worker: caches the app so it opens with no signal.
   IMPORTANT: change CACHE (for example rvapp-v2) every time you publish a new version of any file,
   so phones pick up the update as one consistent set. */
const CACHE = 'rvapp-v15';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/doto-latin-700-normal.woff2',
  './fonts/space-grotesk-latin-400-normal.woff2',
  './fonts/space-grotesk-latin-500-normal.woff2',
  './fonts/space-grotesk-latin-700-normal.woff2',
  './js/util.js',
  './js/defaults.js',
  './js/db.js',
  './js/logic.js',
  './js/config.js',
  './js/store.js',
  './js/drive.js',
  './js/smile.js',
  './js/ma.js',
  './js/dom.js',
  './js/ui-core.js',
  './js/forms.js',
  './js/screens.js',
  './js/insights.js',
  './js/settings.js',
  './js/app.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
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
