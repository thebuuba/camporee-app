'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DataFreshness(){
  const router=useRouter();
  const pathname=usePathname();
  const lastRefresh=useRef(0);

  useEffect(()=>{
    if(pathname==='/login'||pathname==='/signup'||pathname.startsWith('/auth/'))return;
    const supabase=createClient();
    let refreshTimer:number|undefined;
    const refresh=()=>{
      if(!navigator.onLine)return;
      const now=Date.now();
      if(now-lastRefresh.current<1500)return;
      lastRefresh.current=now;
      router.refresh();
    };
    const queueRefresh=()=>{
      if(refreshTimer)window.clearTimeout(refreshTimer);
      refreshTimer=window.setTimeout(refresh,250);
    };
    const onVisibility=()=>{if(document.visibilityState==='visible')refresh()};
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
    window.addEventListener('camporee:queue-flushed',refresh);
    document.addEventListener('visibilitychange',onVisibility);
    const channel=supabase
      .channel('camporee-shared-data')
      .on('postgres_changes',{event:'*',schema:'public'},queueRefresh)
      .subscribe();
    const interval=window.setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
    return()=>{
      window.removeEventListener('focus',refresh);
      window.removeEventListener('online',refresh);
      window.removeEventListener('camporee:queue-flushed',refresh);
      document.removeEventListener('visibilitychange',onVisibility);
      if(refreshTimer)window.clearTimeout(refreshTimer);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  },[pathname,router]);

  return null;
}
