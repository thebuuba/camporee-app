'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function DataFreshness(){
  const router=useRouter();
  const pathname=usePathname();
  const lastRefresh=useRef(Date.now());

  useEffect(()=>{
    if(pathname==='/login'||pathname==='/signup'||pathname.startsWith('/auth/'))return;
    const refresh=()=>{
      if(!navigator.onLine)return;
      const now=Date.now();
      if(now-lastRefresh.current<1500)return;
      lastRefresh.current=now;
      router.refresh();
    };
    const onVisibility=()=>{if(document.visibilityState==='visible')refresh()};
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
    window.addEventListener('camporee:queue-flushed',refresh);
    document.addEventListener('visibilitychange',onVisibility);
    const liveRoute=pathname==='/'||pathname==='/program';
    const interval=liveRoute ? window.setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000) : undefined;
    return()=>{
      window.removeEventListener('focus',refresh);
      window.removeEventListener('online',refresh);
      window.removeEventListener('camporee:queue-flushed',refresh);
      document.removeEventListener('visibilitychange',onVisibility);
      if(interval)window.clearInterval(interval);
    };
  },[pathname,router]);

  return null;
}
