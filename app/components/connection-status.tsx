'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { flushOfflineWrites, getOfflineQueueCount } from '@/lib/offline-fetch';
import { createClient } from '@/lib/supabase/client';

export default function ConnectionStatus(){
  const pathname=usePathname();
  const [online,setOnline]=useState(true);
  const [queued,setQueued]=useState(0);
  const [recovered,setRecovered]=useState(false);
  const [syncError,setSyncError]=useState(false);
  const [requestError,setRequestError]=useState(false);

  const syncNow=useCallback(async()=>{
    if(!navigator.onLine)return;
    const {data}=await createClient().auth.getSession();
    const token=data.session?.access_token;
    if(!token){setSyncError(false);return;}
    const result=await flushOfflineWrites(`Bearer ${token}`);
    setQueued(result.remaining);
    setSyncError(result.failed);
  },[]);

  useEffect(()=>{
    let timer:number|undefined;
    const refreshQueue=()=>void getOfflineQueueCount().then(setQueued).catch(()=>undefined);
    const syncConnection=()=>{
      const next=navigator.onLine;
      setOnline(next);
      if(next){
        setRecovered(true);
        window.clearTimeout(timer);
        timer=window.setTimeout(()=>setRecovered(false),1800);
        void syncNow();
      }
      refreshQueue();
    };
    const queueState=(event:Event)=>setQueued(Number((event as CustomEvent<{count:number}>).detail?.count || 0));
    const queueError=()=>setSyncError(true);
    const dataError=()=>{
      setRequestError(true);
      window.clearTimeout(timer);
      timer=window.setTimeout(()=>setRequestError(false),5000);
    };
    setOnline(navigator.onLine);
    refreshQueue();
    window.addEventListener('online',syncConnection);
    window.addEventListener('offline',syncConnection);
    window.addEventListener('camporee:queue-state',queueState as EventListener);
    window.addEventListener('camporee:queue-flushed',refreshQueue as EventListener);
    window.addEventListener('camporee:sync-error',queueError);
    window.addEventListener('camporee:request-error',dataError);
    if(navigator.onLine)void syncNow();
    return()=>{window.removeEventListener('online',syncConnection);window.removeEventListener('offline',syncConnection);window.removeEventListener('camporee:queue-state',queueState as EventListener);window.removeEventListener('camporee:queue-flushed',refreshQueue as EventListener);window.removeEventListener('camporee:sync-error',queueError);window.removeEventListener('camporee:request-error',dataError);window.clearTimeout(timer)};
  },[syncNow]);

  if(pathname==='/login'||pathname==='/signup'||pathname.startsWith('/auth/'))return null;
  if(online && queued===0 && !recovered && !syncError && !requestError)return null;
  const text = !online
    ? queued > 0 ? `Sin internet · ${queued} ${queued===1?'cambio guardado':'cambios guardados'} para sincronizar` : 'Sin internet · puedes seguir usando las pantallas ya visitadas'
    : requestError ? 'No se pudo guardar el cambio. Inténtalo otra vez.' : syncError ? `${queued} ${queued===1?'cambio pendiente':'cambios pendientes'} · no se descartaron` : queued > 0 ? `Sincronizando ${queued} ${queued===1?'cambio':'cambios'}…` : 'Conexión recuperada';
  return <div className={'connection-toast '+(online?'syncing':'offline')} role={syncError||requestError?'alert':'status'}>{!online?<CloudOff size={15}/>:queued>0?<RefreshCw className={syncError?'':'spin'} size={15}/>:requestError?<CloudOff size={15}/>:<Wifi size={15}/>}<span>{text}</span>{online&&syncError?<button type='button' onClick={()=>void syncNow()}>Reintentar</button>:null}</div>
}
