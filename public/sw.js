const CACHE='camporee-shell-v6';
const STATIC=['/offline','/manifest.webmanifest','/camporee-home-icon-v2.png','/apple-touch-icon.png'];
const PRIVATE_NAV_PREFIXES=['/','/program','/tasks','/more','/search'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(req);
        const cacheable=response.ok&&!url.pathname.startsWith('/login')&&!url.pathname.startsWith('/signup')&&!url.pathname.startsWith('/auth/');
        if(cacheable&&PRIVATE_NAV_PREFIXES.some(prefix=>url.pathname===prefix||url.pathname.startsWith(prefix+'/'))){const cache=await caches.open(CACHE);await cache.put(req,response.clone())}
        return response;
      }catch{
        return (await caches.match(req))||(await caches.match('/offline'));
      }
    })());
    return;
  }
  if(url.pathname.startsWith('/_next/static/')||url.pathname.endsWith('.css')||url.pathname.endsWith('.js')||url.pathname.endsWith('.svg')||url.pathname.endsWith('.png')){
    event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res})));return;
  }
});
