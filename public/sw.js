// JMT Dashboard service worker
// Goals:
//   1. Instant cold-open from home-screen icon (cache app shell)
//   2. Safe for auth/data (network-first for API + server-rendered HTML)
//   3. Offline fallback page
//   4. Cache bust on every deploy (via CACHE_VERSION bump during build)

// IMPORTANT: bump this string on every meaningful deploy so clients pick up
// the new service worker and flush old caches.
const CACHE_VERSION = "jmt-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const OFFLINE_URL = "/offline.html";

// Minimal shell — icons + manifest + offline page. Next.js chunks are versioned
// and fetched lazily, so they're cached on first request, not pre-cached here.
const SHELL_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_URLS);
      // Activate this SW immediately so Jeremy sees the fix on next app open,
      // not two opens later.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any caches from older versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Helper — fetch with a hard timeout so a slow Supabase call can't make the
// UI feel like it's "hanging" forever.
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("sw-timeout")), ms);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs.
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Never cache Supabase auth or Next.js RSC flight chunks — always go network.
  if (url.pathname.startsWith("/api/auth")) return;
  if (url.searchParams.has("_rsc")) return;

  // Strategy A — static Next.js assets (/_next/static/*): cache-first, forever.
  // These URLs are content-hashed, so cached copies are safe indefinitely.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          return new Response("", { status: 504 });
        }
      })()
    );
    return;
  }

  // Strategy B — icons, manifest, images under /public: stale-while-revalidate.
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|webmanifest)$/) ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await networkPromise) || new Response("", { status: 504 });
      })()
    );
    return;
  }

  // Strategy C — page navigations (HTML): network-first with 4s timeout and
  // offline fallback. This is the critical path for the "slow home-screen
  // open" problem — if the network is slow, we show offline.html instead of
  // a white hang.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetchWithTimeout(req, 4000);
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })()
    );
    return;
  }

  // Everything else: just pass through.
});

// Allow the page to tell the SW to skip waiting (used after a new SW is found).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
