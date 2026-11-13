const CACHE = "brandle-glimmer-grove-v2";
const ASSETS = ["./","./index.html","./styles.css","./app.mjs","./logic.mjs","./words.mjs","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-512.png","./og.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("brandle-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
  event.respondWith(fetch(req).then(response=>{
    if(response.ok&&new URL(req.url).pathname!="/sw.js"){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)));
    }
    return response;
  }).catch(()=>caches.match(req).then(cached=>cached||caches.match("./index.html"))));
});