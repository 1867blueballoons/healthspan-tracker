// Healthspan Dev Service Worker - Development Cache-Bypassing Strategy
self.addEventListener('install', event => {
    self.skipWaiting();
  });
  
  self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
  });
  
  self.addEventListener('fetch', event => {
    // Network-only fetch strategy during active development testing
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => new Response('Offline'))
    );
  });