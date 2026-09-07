'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';

export default function ConnectionStatus(){
  const [online,setOnline]=useState(true); const [queued,setQueued]=useState(false);
  useEffect(()=>{
    const sync=()=>setOnline(navigator.onLine); const markQueued=()=>setQueued(true); const flushed=()=>setQueued(false);
    sync(); window.addEventListener('online',sync); window.addEventListener('offline',sync); window.addEventListener('camporee:queued-write',markQueued as EventListener); window.addEventListener('camporee:queue-flushed',flushed as EventListener);
    return()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync);window.removeEventListener('camporee:queued-write',markQueued as EventListener);window.removeEventListener('camporee:queue-flushed',flushed as EventListener)};
  },[]);
  if(online&&!queued)return null;
  return <div className={'connection-toast '+(online?'syncing':'offline')} role='status'>{online?<RefreshCw size={15}/>:<CloudOff size={15}/>}<span>{online?'Sincronizando cambios…':'Sin internet · los cambios se guardarán y sincronizarán'}</span></div>
}
