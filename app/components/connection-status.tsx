'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { flushOfflineWrites, getOfflineQueueCount } from '@/lib/offline-fetch';

export default function ConnectionStatus(){
  const [online,setOnline]=useState(true);
  const [queued,setQueued]=useState(0);
  const [recovered,setRecovered]=useState(false);

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
        void flushOfflineWrites();
      }
      refreshQueue();
    };
    const queueState=(event:Event)=>setQueued(Number((event as CustomEvent<{count:number}>).detail?.count || 0));
    setOnline(navigator.onLine);
    refreshQueue();
    window.addEventListener('online',syncConnection);
    window.addEventListener('offline',syncConnection);
    window.addEventListener('camporee:queue-state',queueState as EventListener);
    window.addEventListener('camporee:queue-flushed',refreshQueue as EventListener);
    return()=>{window.removeEventListener('online',syncConnection);window.removeEventListener('offline',syncConnection);window.removeEventListener('camporee:queue-state',queueState as EventListener);window.removeEventListener('camporee:queue-flushed',refreshQueue as EventListener);window.clearTimeout(timer)};
  },[]);

  if(online && queued===0 && !recovered)return null;
  const text = !online
    ? queued > 0 ? `Sin internet · ${queued} ${queued===1?'cambio guardado':'cambios guardados'} para sincronizar` : 'Sin internet · puedes seguir usando las pantallas ya visitadas'
    : queued > 0 ? `Sincronizando ${queued} ${queued===1?'cambio':'cambios'}…` : 'Conexión recuperada';
  return <div className={'connection-toast '+(online?'syncing':'offline')} role='status'>{!online?<CloudOff size={15}/>:queued>0?<RefreshCw className='spin' size={15}/>:<Wifi size={15}/>}<span>{text}</span></div>
}
