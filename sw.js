// Service worker: makes the app work offline and delivers new versions.
//
// RULE: bump VERSION on every change to any app file. A new VERSION makes the
// browser see a changed sw.js, install it, download all files fresh into a new
// cache, delete the old cache, and reload the app.
const VERSION = '9';
const CACHE_PREFIX = 'gym-tracker-';
const CACHE = CACHE_PREFIX + 'v' + VERSION;

// Every file the app needs. Add new files here, or they won't work offline.
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './log.js',
  './body.js',
  './settings.js',
  './install.js',
  './timer.js',
  './ui.js',
  './defaults.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the browser's HTTP cache, so we never store a
    // stale copy that GitHub Pages' ~10 minute cache might hand back.
    await cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting(); // take over right away instead of waiting
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim(); // control already-open pages too
  })());
});

// Cache first: answer from the saved copy (instant, works offline);
// only go to the network for things we don't have.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Any page navigation gets the app's single page.
    const hit = req.mode === 'navigate'
      ? await cache.match('./')
      : await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});

// Lets the page ask which version is running.
self.addEventListener('message', (event) => {
  if (event.data === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage(VERSION);
  }
});
