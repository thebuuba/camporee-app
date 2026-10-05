const CACHE='camporee-shell-v18';
const PAGES='camporee-pages-v1';
const ASSETS='camporee-assets-v1';
const STATIC=['/offline','/manifest.webmanifest?v=14','/camporee-logo-v8.png?v=11','/apple-touch-icon.png?v=11'];
const PRIVATE_NAV_PREFIXES=['/','/program','/tasks','/more','/search','/profile'];
const isPrivatePage=path=>PRIVATE_NAV_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix+'/'));
let privateEpoch=0;
let privateClears=0;
async function clearPrivatePages(){
  privateEpoch++;
  privateClears++;
  try{
    await caches.delete(PAGES).catch(()=>undefined);
    for(const key of await caches.keys()){
      if(!key.startsWith('camporee-shell-'))continue;
      const cache=await caches.open(key);
      for(const request of await cache.keys())if(isPrivatePage(new URL(request.url).pathname))await cache.delete(request);
    }
  }finally{privateClears--}
}
self.addEventListener('message',event=>{if(event.data?.type==='CLEAR_PRIVATE_PAGES')event.waitUntil(clearPrivatePages());});

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(STATIC))
      .catch(()=>undefined)
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const migrationEpoch=privateEpoch;
    const keys=await caches.keys().catch(()=>[]);
    // Preserve visited pages and their original chunks across app updates.
    for(const key of keys.filter(k=>k.startsWith('camporee-shell-')&&k!==CACHE)){
      try{
        const previous=await caches.open(key);
        for(const request of await previous.keys()){
          const url=new URL(request.url);
          const target=isPrivatePage(url.pathname)?PAGES:url.pathname.startsWith('/_next/static/')||/\.(css|js|svg)$/.test(url.pathname)?ASSETS:null;
          if(!target)continue;
          if(target===PAGES&&(migrationEpoch!==privateEpoch||privateClears))continue;
          if(await caches.match(request,{cacheName:target}))continue;
          const response=await previous.match(request);
          if(response){
            const destination=await caches.open(target);
            if(target!==PAGES||(migrationEpoch===privateEpoch&&!privateClears))await destination.put(request,response);
          }
        }
        await caches.delete(key);
      }catch{/* Keep the old cache if migration cannot finish (for example, storage quota). */}
    }
    if(self.registration.navigationPreload){
      await self.registration.navigationPreload.enable().catch(()=>undefined);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  if((req.mode==='navigate'&&/^\/(login|signup)(\/|$)/.test(url.pathname))||url.pathname.startsWith('/auth/'))event.waitUntil(clearPrivatePages());
  if(req.method!=='GET')return;

  if(url.pathname.startsWith('/audio/')&&url.pathname.endsWith('.mp3')){
    event.respondWith((async()=>{
      try{
        let response=await caches.match(url.href);
        if(!response){
          // Request the whole file so cached playback can serve any byte range offline.
          response=await fetch(url.href);
          if(response.status!==200)return response;
          try{await (await caches.open(CACHE)).put(url.href,response.clone())}catch{/* Playback still works if storage is full. */}
        }
        const range=req.headers.get('range');
        if(!range)return response;
        const match=/^bytes=(\d*)-(\d*)$/.exec(range);
        if(!match||(!match[1]&&!match[2]))return response;
        const buffer=await response.arrayBuffer(),size=buffer.byteLength;
        const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
        const end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;
        if(start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
        return new Response(buffer.slice(start,end+1),{status:206,headers:{'Content-Type':response.headers.get('Content-Type')||'audio/mpeg','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1)}});
      }catch{return Response.error()}
    })());
    return;
  }

  const pageSnapshot=isPrivatePage(url.pathname)&&req.headers?.get('accept')?.includes('text/html');
  if(req.mode==='navigate'||pageSnapshot){
    const requestEpoch=privateEpoch;
    event.respondWith((async()=>{
      const isPrivate=isPrivatePage(url.pathname);
      const isAuth=url.pathname.startsWith('/login')||url.pathname.startsWith('/signup')||url.pathname.startsWith('/auth/');
      // Never launch an old deployment while online: its chunks may no longer exist.
      try{
        const preloaded=await Promise.resolve(event.preloadResponse).catch(()=>undefined);
        const response=preloaded||await fetch(req);
        if(response.ok&&!response.redirected&&!isAuth&&isPrivate&&requestEpoch===privateEpoch&&!privateClears){
          try{
            const cache=await caches.open(PAGES);
            if(requestEpoch===privateEpoch&&!privateClears)await cache.put(req,response.clone());
          }catch{/* Cache storage is optional, including on iOS with limited space. */}
        }
        return response;
      }catch{
        let cached;
        if(!isAuth&&isPrivate&&!privateClears&&requestEpoch===privateEpoch)cached=(await caches.match(req,{cacheName:PAGES}))||(await caches.match(req));
        if(privateClears||requestEpoch!==privateEpoch)cached=undefined;
        return cached||(await caches.match('/offline'))||Response.error();
      }
    })());
    return;
  }

  if(url.pathname.endsWith('.png')||url.pathname.includes('manifest.webmanifest')){
    event.respondWith((async()=>{
      const cached=await caches.match(req);
      const network=fetch(req,{cache:'reload'}).then(async res=>{
        if(res.ok){
          const cache=await caches.open(CACHE);
          await cache.put(req,res.clone());
        }
        return res;
      }).catch(()=>undefined);
      if(cached){
        event.waitUntil(network);
        return cached;
      }
      return (await network)||Response.error();
    })());
    return;
  }

  if(url.pathname.startsWith('/_next/static/')||url.pathname.endsWith('.css')||url.pathname.endsWith('.js')||url.pathname.endsWith('.svg')){
    event.respondWith((async()=>{
      try{
        const res=await fetch(req);
        if(res.ok){
          try{
            const cache=await caches.open(ASSETS);
            await cache.put(req,res.clone());
          }catch{/* Do not fail a successful request when cache storage is unavailable. */}
        }
        else return (await caches.match(req))||res;
        return res;
      }catch{
        return (await caches.match(req))||Response.error();
      }
    })());
    return;
  }
});

self.addEventListener('push',event=>{
  let data={title:'Camporee',body:'Tienes un nuevo aviso.',url:'/more/announcements'};
  try{if(event.data)data={...data,...event.data.json()}}catch{if(event.data)data.body=event.data.text()}
  event.waitUntil(self.registration.showNotification(data.title||'Camporee',{body:data.body||'',icon:'/camporee-icon-512.png',badge:'/apple-touch-icon.png',tag:data.tag||'camporee-notification',data:{url:data.url||'/more/announcements'}}));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||'/more/announcements';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){if('focus'in client){client.navigate(target);return client.focus()}}
    return clients.openWindow?clients.openWindow(target):undefined;
  }));
});
