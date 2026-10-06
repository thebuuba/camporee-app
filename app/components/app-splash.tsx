'use client';

import { useEffect, useState } from 'react';

export default function AppSplash() {
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const readyTimer = window.setTimeout(() => setReady(true), reduced ? 100 : 1200);
    const dismissTimer = window.setTimeout(() => setVisible(false), reduced ? 180 : 1650);
    return () => { window.clearTimeout(readyTimer); window.clearTimeout(dismissTimer); };
  }, []);
  if (!visible) return null;
  return <div className="pm-launch-screen" aria-label="Cargando Camporee" role="status">
    <div className="pm-launch-panel">
      <img className="pm-launch-scene" src="/polymet-camp-preparation.svg" alt="" aria-hidden="true" />
      <div className="pm-launch-glow" aria-hidden="true" />
      <div className="pm-launch-content">
        <span className="pm-launch-mark" aria-hidden="true"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg></span>
        <h1>Camporee</h1>
        <p>Organiza tu camporee antes, durante y después del evento.</p>
        <div className="pm-launch-loading">
          <span className="pm-launch-progress" aria-hidden="true"><span /></span>
          <small>{ready ? '¡Todo listo!' : 'Preparando tu camporee…'}</small>
        </div>
      </div>
      <p className="pm-launch-footer">Club de Conquistadores · versión 1.0</p>
    </div>
  </div>;
}
