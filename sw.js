/* ============================================================================
 * sw.js — Service Worker for Offline PWA Support
 * ============================================================================ */

const CACHE_NAME = "housedash-v1";

const ASSETS_TO_CACHE = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/app.js",
  "js/model3d.js",
  "js/vendor/three.min.js",
  "js/vendor/orbitcontrols.js",
  "data/data.js",
  "data/model3d.js",
  "data/model3d.json",
  "assets/icon.svg",
  "assets/floorplan-walls.png",
  "assets/plan-optimized.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("PWA pre-cache warning:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only cache GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response, fetch update in background
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // Fallback to index.html if navigating
          if (event.request.mode === "navigate") {
            return caches.match("index.html");
          }
        });
    })
  );
});
