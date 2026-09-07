'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';

export default function ConnectionStatus(){
  const [online,setOnline]=useState(true);
  const [justRecovered,setJustRecovered]=useState(false);

  useEffect(()=>{
    let timer:number|undefined;
    const sync=()=>{
      const next=navigator.onLine;
      if(next && !online){
        setJustRecovered(true);
        window.clearTimeout(timer);
        timer=window.setTimeout(()=>setJustRecovered(false),1800);
      }
      setOnline(next);
    };
    setOnline(navigator.onLine);
    window.addEventListener('online',sync);
    window.addEventListener('offline',sync);
    return()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync);window.clearTimeout(timer)};
  },[online]);

  if(online&&!justRecovered)return null;
  return <div className={'connection-toast '+(online?'syncing':'offline')} role='status'>{online?<Wifi size={15}/>:<CloudOff size={15}/>}<span>{online?'Conexión recuperada':'Sin internet · puedes abrir pantallas visitadas; los cambios requieren conexión'}</span></div>
}
