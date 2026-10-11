'use client';

import {useEffect,useState} from 'react';
import {getOfflineQueueCount} from '@/lib/offline-fetch';

// Never claim "Sincronizado" while writes remain queued on this device.
export default function SyncStatus() {
  const [state,setState]=useState<'checking'|'online'|'offline'|'error'>('checking');
  const [pending,setPending]=useState<number|null>(null);
  useEffect(()=>{
    let live=true;
    const refresh=()=>{
      if(!live)return;
      setState(navigator.onLine?'online':'offline');
      void getOfflineQueueCount().then(count=>{if(live)setPending(count);})
        .catch(()=>{if(live){setState('error');setPending(null);}});
    };
    refresh();
    window.addEventListener('online',refresh);
    window.addEventListener('offline',refresh);
    window.addEventListener('camporee:queue-state',refresh);
    window.addEventListener('camporee:sync-error',refresh);
    return ()=>{
      live=false;
      window.removeEventListener('online',refresh);
      window.removeEventListener('offline',refresh);
      window.removeEventListener('camporee:queue-state',refresh);
      window.removeEventListener('camporee:sync-error',refresh);
    };
  },[]);
  const label=state==='checking'?'Comprobando sincronización…':
    state==='error'?'Estado de sincronización no disponible':
    pending!==null&&pending>0?`${pending} cambio(s) pendiente(s)`:
    state==='offline'?'Sin conexión':'Sin cambios pendientes';
  return <span className="polymet-sync" role="status" aria-live="polite">{label}</span>;
}
