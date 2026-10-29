'use client';

import {useCallback,useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {camporeeClock,camporeeDayWindow} from '@/lib/camporee-card';
import {formatCamporeeDate} from '@/lib/camporee-locale';
import {claimEventIntro,eventIntroCandidates,regionalSabbathPeriod,type EventIntro,type IntroEvent} from '@/lib/event-intro';
import {supportsSunsetRegion} from '@/supabase/functions/_shared/sunset';
import {useDailySunset} from '../camporee-card/daily-sunset';
import {CamporeeModeIntro} from './camporee-mode-intro';
import {SabbathModeIntro} from './sabbath-mode-intro';

type Props={userId:string;organizationId:string;organizer:string;memberName:string;camporee:IntroEvent&{id:string;name:string;theme:string|null;location:string|null}};

export default function EventIntros({userId,organizationId,organizer,memberName,camporee}:Props){
  const [now,setNow]=useState<number|null>(null);
  const [intro,setIntro]=useState<EventIntro|null>(null);
  useEffect(()=>{
    const update=()=>setNow(Date.now());
    update();
    const timer=window.setInterval(update,15000);
    window.addEventListener('focus',update);
    document.addEventListener('visibilitychange',update);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  const tick=now??0;
  const clock=camporeeClock(tick,camporee.time_zone);
  const eligible=now!==null&&!['finished','archived'].includes(camporee.status)&&clock.date>=camporee.starts_on&&clock.date<=camporee.ends_on;
  const sunset=useDailySunset(tick,eligible&&supportsSunsetRegion(camporee.location,camporee.time_zone)&&(clock.weekday===5||clock.weekday===6));
  const sabbath=eligible?regionalSabbathPeriod(tick,sunset):null;
  const candidates=eligible?eventIntroCandidates(camporee,tick,sabbath):[];
  const candidateKeys=candidates.map(item=>item.key).join('|');
  const scope=`${userId}:${organizationId}:${camporee.id}`;
  useEffect(()=>{
    if(intro){if(!candidates.some(item=>item.key===intro.key))setIntro(null);return;}
    let storage:Storage|null=null;
    try{storage=window.localStorage;}catch{/* Use the document guard when storage is unavailable. */}
    const next=candidates.find(item=>claimEventIntro(storage,scope,item.key));
    if(next)setIntro(next);
  // Candidate identities fully describe eligibility; avoid reopening on clock ticks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[candidateKeys,scope,intro]);
  const dismiss=useCallback(()=>setIntro(null),[]);
  if(!intro)return null;
  const day=camporeeDayWindow(camporee.starts_on,camporee.ends_on,clock.date);
  return createPortal(<div className="camp-intro-root">
    {intro.kind==='camporee'?<CamporeeModeIntro organizer={organizer} theme={camporee.theme||camporee.name} verseRef="" memberName={memberName} club={organizer} dateLabel={`${formatCamporeeDate(camporee.starts_on)} – ${formatCamporeeDate(camporee.ends_on)}`} location={camporee.location||''} currentDay={day.currentDay} totalDays={day.totalDays} onClose={dismiss}/>
      :<SabbathModeIntro memberName={memberName} onClose={dismiss}/>}
  </div>,document.body);
}
