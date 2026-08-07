// Bumped to v1.9 to trigger the update
const CACHE_NAME = 'healthspan-v1.9';
const ASSETS = [
  './index.html',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// Install and Cache assets
self.addEventListener('install', (e) => {
  // THE HOSTILE TAKEOVER COMMAND: 
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();

  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Clear old caches on activation
self.addEventListener('activate', (e) => {
  // TELL ALL OPEN TABS/APPS TO IMMEDIATELY USE THIS NEW WORKER
  e.waitUntil(self.clients.claim());

  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
});

// Serve from Cache, Fallback to Network
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('script.google.com')) {
    return; 
  }

  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});