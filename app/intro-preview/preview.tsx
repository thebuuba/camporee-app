'use client';

import {useCallback,useState} from 'react';
import {createPortal} from 'react-dom';
import {CamporeeModeIntro} from '../components/event-intro/camporee-mode-intro';
import {SabbathModeIntro} from '../components/event-intro/sabbath-mode-intro';

export default function IntroPreview(){
  const [intro,setIntro]=useState<'camporee'|'sabbath'|null>(null);
  const close=useCallback(()=>setIntro(null),[]);
  return <main className="app" style={{padding:'48px 24px'}}>
    <h1>Introducciones del camporee</h1>
    <p>Vista de prueba local. Puedes repetir las animaciones sin cambiar las fechas ni los registros del evento.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:24}}>
      <button type="button" onClick={()=>setIntro('camporee')}>Ver Modo Camporee</button>
      <button type="button" onClick={()=>setIntro('sabbath')}>Ver Feliz Sábado</button>
    </div>
    {intro?createPortal(<div className="camp-intro-root">
      {intro==='camporee'?<CamporeeModeIntro organizer="Bi-Campore Legado" theme="Esfuérzate y sé valiente" verseRef="Josué 1:9" memberName="Conquistador" club="Club de Conquistadores" dateLabel="6 – 9 de noviembre de 2026" location="Santiago" currentDay={1} totalDays={4} onClose={close}/>
        :<SabbathModeIntro memberName="Conquistador" onClose={close}/>}
    </div>,document.body):null}
  </main>;
}
