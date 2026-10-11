'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function AppSplash() {
  const pathname = usePathname();
  // Start hidden on the server too, so offline HTML never flashes a splash
  // before hydration. Native offline navigation remounts the whole app.
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (pathname === '/signup' || pathname === '/offline' || !navigator.onLine) return;
    try {
      if (window.sessionStorage.getItem('camporee:splash-seen') === 'yes') return;
      window.sessionStorage.setItem('camporee:splash-seen', 'yes');
    } catch { /* Storage can be blocked; the mount guard still prevents replay. */ }
    setVisible(true);
  }, [pathname]);
  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const readyTimer = window.setTimeout(() => setReady(true), reduced ? 100 : 1200);
    const dismissTimer = window.setTimeout(() => setVisible(false), reduced ? 180 : 1650);
    return () => { window.clearTimeout(readyTimer); window.clearTimeout(dismissTimer); };
  }, [visible]);
  if (!visible || pathname === '/signup') return null;
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
