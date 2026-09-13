const CACHE='camporee-shell-v13';
const STATIC=['/offline','/manifest.webmanifest?v=12','/camporee-logo-v8.png?v=11','/apple-touch-icon.png?v=11'];
const PRIVATE_NAV_PREFIXES=['/','/program','/tasks','/more','/search'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(STATIC))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('camporee-shell-')&&k!==CACHE).map(k=>caches.delete(k)));
    if(self.registration.navigationPreload){
      await self.registration.navigationPreload.enable().catch(()=>undefined);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;

  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      const isPrivate=PRIVATE_NAV_PREFIXES.some(prefix=>url.pathname===prefix||url.pathname.startsWith(prefix+'/'));
      const isAuth=url.pathname.startsWith('/login')||url.pathname.startsWith('/signup')||url.pathname.startsWith('/auth/');
      const cached=!isAuth&&isPrivate?await caches.match(req):undefined;

      const networkPromise=(async()=>{
        const preloaded=await event.preloadResponse.catch(()=>undefined);
        const response=preloaded||await fetch(req);
        if(response.ok&&!isAuth&&isPrivate){
          const cache=await caches.open(CACHE);
          await cache.put(req,response.clone());
        }
        return response;
      })();

      if(cached){
        event.waitUntil(networkPromise.catch(()=>undefined));
        return cached;
      }

      try{
        return await networkPromise;
      }catch{
        return (await caches.match('/offline'));
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
      const cached=await caches.match(req);
      const network=fetch(req).then(async res=>{
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
