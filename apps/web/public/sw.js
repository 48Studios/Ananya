// Minimal Service Worker for PWA installability and offline readiness
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through fetch handler satisfying PWA installability criteria
  // while ensuring dynamic ERP mutations and API responses remain fresh
  event.respondWith(fetch(event.request));
});
