import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = dirname(fileURLToPath(import.meta.url));
const FILES = [
 "index.html","styles.css","glimmer-v2.css","app.mjs","logic.mjs","words.mjs",
 "manifest.webmanifest","icon.svg","icon-180.png","icon-512.png",
 "og.png","og.svg","sw.js"
];
const encodings = Object.fromEntries(await Promise.all(FILES.map(async name => [
  "/" + name, (await readFile(join(ROOT,name))).toString("base64")
])));
const workerSource = `
/** Auto-generated from games/brandle source; do not edit manually. */
const BASE64 = ${JSON.stringify(encodings)};
const MIME = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".js":"text/javascript; charset=utf-8",".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const decoded = new Map();
export default {
  async fetch(request) {
    if(request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed",{status:405});
    const path = new URL(request.url).pathname;
    const key = path === "/" ? "/index.html" : path;
    const data = BASE64[key];
    if(!data) return new Response("Not found",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8"}});
    if(!decoded.has(key)) {
      const binary=atob(data);
      const array=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++) array[i]=binary.charCodeAt(i);
      decoded.set(key,array);
    }
    const ext = key.slice(key.lastIndexOf("."));
    const headers = {"Content-Type":MIME[ext]??"application/octet-stream",
      "Cache-Control":key==="/index.html"||key==="/sw.js"?"no-cache":"public, max-age=3600",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      "X-Frame-Options":"DENY"};
    return new Response(request.method==="HEAD"?null:decoded.get(key),{status:200,headers});
  }
};`;
const dest=join(ROOT,"dist","worker.mjs");
await mkdir(dirname(dest),{recursive:true});
await writeFile(dest,workerSource);
console.log("Built worker with "+FILES.length+" offline assets ("+workerSource.length+" JS chars).");
