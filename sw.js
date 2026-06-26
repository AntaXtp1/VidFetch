// VidFetch Service Worker — cache shell for offline/PWA
const CACHE = 'vidfetch-v1';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/config.js',
  '/js/api.js',
  '/js/download-view.js',
  '/js/history-view.js',
  '/js/app.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Network first for API calls, cache first for shell
  const url = new URL(e.request.url);
  const isApi = url.hostname.includes('synoxcloud') || url.hostname.includes('googlevideo') || url.hostname.includes('workers.dev');
  if (isApi) return; // let API calls go straight to network

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
