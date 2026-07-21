// Creative Empire OS — service worker
//
// Scope is deliberately narrow: this app is GPS + Firebase + live map tiles,
// none of which should ever be served from a stale cache. This worker only
// caches same-origin STATIC assets (the built JS/CSS bundles, the GLB
// avatar/building models, icons) for fast repeat loads and a usable offline
// shell. Firebase calls, OpenFreeMap tiles, and any other cross-origin
// request pass straight through, untouched, every time.
//
// Bump CACHE_VERSION on any change to this file's caching logic so old
// caches get cleaned up on the next visit.
const CACHE_VERSION = "v1";
const CACHE_NAME = `creativerpg-${CACHE_VERSION}`;
const APP_SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isCacheableStatic(url) {
  return /\.(js|css|glb|gltf|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only ever handle same-origin GET requests. Everything else (Firebase,
  // Firestore, Auth, map tile servers, the model-viewer CDN, any API call)
  // is explicitly left alone — the browser handles it normally, live, every time.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Navigations (loading the app itself): network-first, so a new deploy is
  // picked up immediately; falls back to the cached shell only when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets (JS/CSS bundles, GLB models, images, fonts): cache-first —
  // these are content-hashed by the Vite build or rarely change, so serving
  // from cache is safe and makes repeat loads (especially the multi-MB GLB
  // files) close to instant.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        }).catch(() => cached);
      })
    );
  }
  // Everything else same-origin (e.g. API-style calls under /api): pass
  // through untouched, no caching.
});
