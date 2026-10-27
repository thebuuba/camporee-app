'use client';

import {useEffect,useState} from 'react';
import {dailySunsetTimes,localDate,sunsetReference,type SunsetReport} from '@/supabase/functions/_shared/sunset';

export function DailySunset({now}:{now:number}){
 const [rows,setRows]=useState<SunsetReport[]>([]);
 const date=localDate(now);
 useEffect(()=>{
  let active=true,pending=false,timer:ReturnType<typeof setTimeout>|undefined;
  async function load(){
   if(pending)return;
   pending=true;clearTimeout(timer);
   try{
    const value=await dailySunsetTimes(date);
    if(active){setRows(value);if(value.length<2)timer=setTimeout(()=>void load(),60000);}
   }finally{pending=false;}
  }
  const reconnect=()=>{void load();};
  void load();window.addEventListener('online',reconnect);
  return()=>{active=false;clearTimeout(timer);window.removeEventListener('online',reconnect);};
 },[date]);
 const sunset=sunsetReference(rows,date);
 return <p className='flex flex-wrap items-center justify-center gap-x-2 py-1 text-xs text-muted-foreground'>
  <a href='https://sunrise-sunset.org/' target='_blank' rel='noopener noreferrer' title='Fuente: Sunrise-Sunset.org' className='font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>Puesta de sol hoy</a>
  <strong className='font-semibold tabular-nums text-foreground'>{sunset?new Intl.DateTimeFormat('es-DO',{timeZone:sunset.timeZone,hour:'numeric',minute:'2-digit'}).format(Date.parse(sunset.sunset)).replace(/\u00a0|\u202f/g,' '):'—'}</strong>
 </p>;
}
