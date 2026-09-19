const CACHE = 'athmeeya-shell-v18';
const CORE = ['./','./index.html','./style.css','./app.js','./songs-data.js','./logo.svg','./apple-touch-icon.png','./download-bg.jpg','./manifest.webmanifest'];
const FRESH_PATHS = new Set(['.html','.css','.js','.json','.webmanifest']);

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(CORE.map(async url=>{
      try{await cache.add(new Request(url,{cache:'no-store'}));}catch(_){ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request){
  try{
    const fresh=await fetch(request,{cache:'no-store'});
    if(fresh && fresh.ok){
      const cache=await caches.open(CACHE);
      await cache.put(request,fresh.clone());
    }
    return fresh;
  }catch(_){
    const cached=await caches.match(request);
    return cached || caches.match('./index.html');
  }
}

async function staleWhileRevalidate(request){
  const cached=await caches.match(request);
  const network=fetch(request).then(async response=>{
    if(response && response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }).catch(()=>null);
  return cached || network || Response.error();
}

self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==location.origin)return;
  const ext=(url.pathname.match(/\.[^.\/]+$/)?.[0]||'').toLowerCase();
  if(FRESH_PATHS.has(ext) || url.pathname.endsWith('/songs-data.js')){
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
