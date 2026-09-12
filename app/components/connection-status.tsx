'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle2, CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { flushOfflineWrites, getOfflineQueueCount } from '@/lib/offline-fetch';
import { createClient } from '@/lib/supabase/client';

export default function ConnectionStatus(){
  const pathname=usePathname();
  const [online,setOnline]=useState(true);
  const [queued,setQueued]=useState(0);
  const [recovered,setRecovered]=useState(false);
  const [syncError,setSyncError]=useState(false);
  const [requestError,setRequestError]=useState(false);
  const [mutationMessage,setMutationMessage]=useState('');
  const [successMessage,setSuccessMessage]=useState('');

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
    let recoveredTimer:number|undefined;
    let requestTimer:number|undefined;
    let messageTimer:number|undefined;
    const refreshQueue=()=>void getOfflineQueueCount().then(setQueued).catch(()=>undefined);
    const syncConnection=()=>{
      const next=navigator.onLine;
      setOnline(next);
      if(next){
        setRecovered(true);
        window.clearTimeout(recoveredTimer);
        recoveredTimer=window.setTimeout(()=>setRecovered(false),1800);
        void syncNow();
      }
      refreshQueue();
    };
    const queueState=(event:Event)=>setQueued(Number((event as CustomEvent<{count:number}>).detail?.count || 0));
    const queueError=()=>setSyncError(true);
    const dataError=()=>{
      setRequestError(true);
      window.clearTimeout(requestTimer);
      requestTimer=window.setTimeout(()=>setRequestError(false),5000);
    };
    const mutationError=(event:Event)=>{
      const message=String((event as CustomEvent<{message?:string}>).detail?.message || 'No se pudo guardar el cambio. Inténtalo otra vez.');
      setSuccessMessage('');
      setMutationMessage(message);
      window.clearTimeout(messageTimer);
      messageTimer=window.setTimeout(()=>setMutationMessage(''),6500);
    };
    const mutationSuccess=(event:Event)=>{
      const message=String((event as CustomEvent<{message?:string}>).detail?.message || 'Cambio guardado.');
      setMutationMessage('');
      setSuccessMessage(message);
      window.clearTimeout(messageTimer);
      messageTimer=window.setTimeout(()=>setSuccessMessage(''),2600);
    };
    setOnline(navigator.onLine);
    refreshQueue();
    window.addEventListener('online',syncConnection);
    window.addEventListener('offline',syncConnection);
    window.addEventListener('camporee:queue-state',queueState as EventListener);
    window.addEventListener('camporee:queue-flushed',refreshQueue as EventListener);
    window.addEventListener('camporee:sync-error',queueError);
    window.addEventListener('camporee:request-error',dataError);
    window.addEventListener('camporee:mutation-error',mutationError);
    window.addEventListener('camporee:mutation-success',mutationSuccess);
    if(navigator.onLine)void syncNow();
    return()=>{
      window.removeEventListener('online',syncConnection);
      window.removeEventListener('offline',syncConnection);
      window.removeEventListener('camporee:queue-state',queueState as EventListener);
      window.removeEventListener('camporee:queue-flushed',refreshQueue as EventListener);
      window.removeEventListener('camporee:sync-error',queueError);
      window.removeEventListener('camporee:request-error',dataError);
      window.removeEventListener('camporee:mutation-error',mutationError);
      window.removeEventListener('camporee:mutation-success',mutationSuccess);
      window.clearTimeout(recoveredTimer);
      window.clearTimeout(requestTimer);
      window.clearTimeout(messageTimer);
    };
  },[syncNow]);

  if(pathname==='/login'||pathname==='/signup'||pathname.startsWith('/auth/'))return null;
  if(online && queued===0 && !recovered && !syncError && !requestError && !mutationMessage && !successMessage)return null;
  const isError=Boolean(mutationMessage||requestError||syncError);
  const text = mutationMessage || successMessage || (!online
    ? queued > 0 ? `Sin internet · ${queued} ${queued===1?'cambio guardado':'cambios guardados'} para sincronizar` : 'Sin internet · puedes seguir usando las pantallas ya visitadas'
    : requestError ? 'No se pudo completar la solicitud. Inténtalo otra vez.' : syncError ? `${queued} ${queued===1?'cambio pendiente':'cambios pendientes'} · no se descartaron` : queued > 0 ? `Sincronizando ${queued} ${queued===1?'cambio':'cambios'}…` : 'Conexión recuperada');
  return <div className={'connection-toast '+(online?'syncing':'offline')+(successMessage?' success':'')} role={isError?'alert':'status'}>{successMessage?<CheckCircle2 size={15}/>:!online?<CloudOff size={15}/>:queued>0?<RefreshCw className={syncError?'':'spin'} size={15}/>:isError?<CloudOff size={15}/>:<Wifi size={15}/>}<span>{text}</span>{online&&syncError&&!mutationMessage?<button type='button' onClick={()=>void syncNow()}>Reintentar</button>:null}</div>
}
