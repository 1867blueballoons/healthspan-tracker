/**
 * Healthspan Daily Tracker - Resilient Offline Service Worker
 */
const CACHE_NAME = 'healthspan-v5.7';
const STATIC_ASSETS = [
  './',
  './index.html',
  './assets/js/pollenService.js',
  './assets/js/sacsiVectorPanel.js',
  './manifest.json'
];

// Optional assets that will not abort installation if missing (404)
const OPTIONAL_ASSETS = [
  './assets/icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Cache Core Mandatory App Shell
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW Install] Mandatory core asset failed: ${asset}`, err);
        }
      }

      // 2. Non-blocking Cache for Optional Branding Icons
      for (const asset of OPTIONAL_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.info(`[SW Install] Skipping non-critical optional asset: ${asset}`);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback for offline navigational requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});