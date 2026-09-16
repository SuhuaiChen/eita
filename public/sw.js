// Eita service worker — makes the app shell work offline (installed PWA).
// Pages: network-first so content is always fresh, falling back to cache.
// /_next/static assets are content-hashed and safe to cache forever.
// API calls and cross-origin requests always go to the network.

const CACHE = "eita-v2";
const SHELL = [
  "/",
  "/hoje",
  "/onboarding",
  "/perfil",
  "/progresso",
  "/privacidade",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // each precache is independent — one failed URL must not kill install
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // immutable hashed build assets → cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ??
          fetch(e.request).then((res) => {
            // only cache good responses — never 404s/redirects/opaque
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // pages → network-first, cached copy offline
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(e.request)
            .then((r) => r ?? caches.match("/hoje"))
            .then((r) => r ?? Response.error())
        )
    );
  }
});
