const CACHE_NAME = 'healthspan-v1.4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com'
];

// Install and Cache assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Serve from Cache, Fallback to Network
self.addEventListener('fetch', (e) => {
  // We do NOT want to cache API calls to Google Apps Script
  if (e.request.url.includes('script.google.com')) {
    return; // Let the browser handle the network request normally
  }

  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});

// Clear old caches on activation
self.addEventListener('activate', (e) => {
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