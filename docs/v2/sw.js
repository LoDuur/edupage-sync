const VERSION = "v2-4";
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = "data-v1";
const FONT_CACHE = "fonts-v1";
const LIB_CACHE = "libs-v1";
const SHELL = [
  "./", "index.html", "app.css?v=3", "manifest.webmanifest",
  "js/app.js?v=3", "js/store.js", "js/timetable.js", "js/changes.js", "js/consult.js", "js/bus.js", "js/intercity.js", "js/route.js", "js/terminal.js", "js/commands.js", "js/pwa.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];
const TRANSIT_ORIGINS = ["https://edupage-proxy.loduur.workers.dev", "http://localhost:8790"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => null)))));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith("shell-") && key !== SHELL_CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request.url, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request.url);
    if (!cached) throw error;
    const headers = new Headers(cached.headers);
    headers.set("X-SW-Cache", "1");
    return new Response(await cached.blob(), { status: cached.status, headers });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  return response;
}

async function shell(request) {
  const cache = await caches.open(SHELL_CACHE);
  if (request.mode === "navigate") {
    try {
      return await fetch(request);
    } catch {
      return (await cache.match("index.html")) || Response.error();
    }
  }
  return (await cache.match(request)) || fetch(request);
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin === scope.origin && /\/(classes\/[^/]+\.json|data\/consultations\.json)$/.test(url.pathname)) return event.respondWith(networkFirst(request));
  if (TRANSIT_ORIGINS.includes(url.origin) && url.pathname.startsWith("/transit/")) return event.respondWith(networkFirst(request));
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return event.respondWith(cacheFirst(request, FONT_CACHE));
  if (url.hostname === "unpkg.com" && url.pathname.startsWith("/leaflet@")) return event.respondWith(cacheFirst(request, LIB_CACHE));
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) return event.respondWith(shell(request));
});
