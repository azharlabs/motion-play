/**
 * The offline cache.
 *
 * Two things are cached, for two different reasons.
 *
 * The app itself is small and changes whenever it is redeployed, so it is
 * fetched from the network first and only falls back to the cache when there
 * is no network. A tester who reloads always gets the build being tested,
 * which matters more here than shaving a few milliseconds off a load.
 *
 * The pose model and its WebAssembly runtime are the opposite: several
 * megabytes, served from a CDN, and pinned to a version in the URL. Those are
 * taken from the cache whenever they are there, because re-downloading them on
 * every visit is the single slowest thing about opening this game on a phone,
 * and a versioned URL can never go stale.
 */
const VERSION = "v1";
const SHELL = `motionplay-shell-${VERSION}`;
const VENDOR = "motionplay-vendor-v1";

/** Enough to open the door offline; everything else is cached as it is used. */
const ESSENTIALS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

/** The hosts the pose model and its runtime come from. */
const isModelHost = (url) =>
  url.hostname === "cdn.jsdelivr.net" || url.hostname === "storage.googleapis.com";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // One missing file should not stop the worker installing, so they go in
      // one at a time rather than through addAll, which is all or nothing.
      await Promise.all(
        ESSENTIALS.map((path) => cache.add(path).catch(() => {})),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, VENDOR]);
      for (const name of await caches.keys()) {
        if (!keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isModelHost(url)) {
    event.respondWith(cacheFirst(request, VENDOR));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  // An opaque response has a status of 0 and cannot be read back usefully, so
  // storing one would poison the cache with a reply we can never check.
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    // A navigation with nothing cached still deserves the app rather than a
    // browser error page; the game itself copes with being offline.
    if (request.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    throw err;
  }
}
