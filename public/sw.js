const CACHE='camporee-shell-v10';
const STATIC=['/offline','/manifest.webmanifest?v=10'];
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
      }catch{return (await caches.match(req))||(await caches.match('/offline'))}
    })());return;
  }
  if(url.pathname.endsWith('.png')||url.pathname.includes('manifest.webmanifest')){
    event.respondWith(fetch(req,{cache:'reload'}).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match(req)));return;
  }
  if(url.pathname.startsWith('/_next/static/')||url.pathname.endsWith('.css')||url.pathname.endsWith('.js')||url.pathname.endsWith('.svg')){
    event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res})));return;
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
