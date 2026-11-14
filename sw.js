const CACHE = "brandle-glimmer-grove-v2";
const ASSETS = ["./","./index.html","./styles.css","./glimmer-v2.css","./app.mjs","./logic.mjs","./words.mjs","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-512.png","./og.png"];
const allowed = new Set(ASSETS.map(path => new URL(path, self.registration.scope).pathname));
const fallback = new URL("./index.html",self.registration.scope).toString();
self.addEventListener("install", event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
));
self.addEventListener("activate", event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("brandle-") && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Never return an HTML document as the response to a missing script or stylesheet.
  event.respondWith(fetch(req).then(response => {
    if (response.ok && allowed.has(url.pathname)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (req.mode === "navigate") {
      const document = await caches.match(fallback);
      if (document) return document;
    }
    return new Response("Offline resource unavailable", {
      status: 503,
      headers: {"Content-Type":"text/plain; charset=utf-8"}
    });
  }));
});
