'use client';

import { useEffect, useState } from 'react';

export default function AppSplash(){
  const [visible,setVisible]=useState(true);
  const [leaving,setLeaving]=useState(false);

  useEffect(()=>{
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const leave=window.setTimeout(()=>setLeaving(true),reduced?350:1050);
    const hide=window.setTimeout(()=>setVisible(false),reduced?500:1350);
    return()=>{window.clearTimeout(leave);window.clearTimeout(hide)};
  },[]);

  if(!visible)return null;
  return <div className={'app-splash'+(leaving?' is-leaving':'')} aria-label="Cargando Camporee" role="status">
    <div className="app-splash-cloud cloud-left" />
    <div className="app-splash-cloud cloud-right" />
    <div className="app-splash-center">
      <div className="app-splash-logo-mark" aria-hidden="true">
        <span className="splash-sun"/>
        <span className="splash-mountain splash-mountain-back"/>
        <span className="splash-mountain splash-mountain-front"/>
        <span className="splash-ground"/>
        <span className="splash-tree">♠</span>
        <span className="splash-tent"/>
      </div>
      <div className="app-splash-title">CAMPOREE</div>
      <div className="app-splash-tagline">MÁS QUE UN CAMPAMENTO,<br/>UNA HISTORIA JUNTOS</div>
      <div className="app-splash-progress" aria-hidden="true"><span /></div>
      <div className="app-splash-loading">Cargando tu aventura…</div>
    </div>
    <div className="app-splash-landscape" aria-hidden="true">
      <span className="pine pine-one">▲</span><span className="pine pine-two">▲</span><span className="pine pine-three">▲</span><span className="pine pine-four">▲</span>
    </div>
  </div>;
}
