'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isLegadoLaunch, launchSchedule, launchScope, offlineLaunchScope, readLaunchSchedule, type LaunchCamporee } from '@/lib/legado-launch';
import LegadoLaunch from './legado-launch';

// Survives component remounts when sessionStorage is unavailable.
let launchChecked = false;
const legadoChecked = new Set<string>();

export default function AppSplash({ camporee, scope }: { camporee?: LaunchCamporee; scope?: string } = {}) {
  const pathname = usePathname();
  // Start hidden on the server too, so offline HTML never flashes a splash
  // before hydration. Native offline navigation remounts the whole app.
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [legado, setLegado] = useState(false);
  const checked = useRef(false);
  const entryPath = useRef(pathname);
  // Only public branding/schedule metadata is saved, never account or meal data.
  useEffect(() => {
    if (!camporee || !scope) return;
    try {
      window.localStorage.setItem(`camporee:launch:${scope}`, JSON.stringify(launchSchedule(camporee)));
      window.localStorage.setItem('camporee:launch:last-scope', scope);
    } catch { /* Storage is optional. */ }
  }, [scope, camporee?.name, camporee?.theme, camporee?.status, camporee?.starts_on, camporee?.ends_on, camporee?.time_zone]);
  useEffect(() => {
    // The authenticated page supplies the current event, avoiding a generic
    // cover flashing before its branded one. Offline uses the scoped fallback.
    if (!camporee && launchScope(pathname)) return;
    if (checked.current) {
      if (pathname !== entryPath.current) setVisible(false);
      return;
    }
    checked.current = true;
    let currentScope = scope ?? launchScope(pathname, window.location.search ?? '');
    let schedule = camporee ? launchSchedule(camporee) : null;
    if (!schedule && pathname === '/offline') {
      try {
        currentScope = offlineLaunchScope(window.localStorage, window.location.search ?? '');
        schedule = readLaunchSchedule(window.localStorage, currentScope);
      } catch { /* Use the regular offline screen. */ }
    }
    const branded = Boolean(currentScope) && isLegadoLaunch(schedule, Date.now());
    const key = branded ? `camporee:splash-legado:${currentScope}:${schedule!.startsOn}` : 'camporee:splash-seen';
    if (branded ? legadoChecked.has(key) : launchChecked) return;
    if (branded) legadoChecked.add(key); else launchChecked = true;
    if (pathname === '/signup' || pathname.startsWith('/auth/') || (!branded && (pathname === '/offline' || !navigator.onLine))) return;
    // Installed apps skip the generic welcome, but retain the event branding.
    // A first reload may reveal newly enabled branding; its session marker then
    // prevents repeats. History and same-origin navigation still skip the cover.
    const installed = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const internal = document.referrer && new URL(document.referrer).origin === window.location.origin;
    if ((!branded && installed) || internal || (navigation && navigation.type !== 'navigate' && !(branded && navigation.type === 'reload'))) return;
    try {
      if (window.sessionStorage.getItem(key) === 'yes') return;
      window.sessionStorage.setItem(key, 'yes');
    } catch { /* The document guard still prevents replay when storage is blocked. */ }
    setLegado(branded);
    if (branded) document.documentElement.setAttribute('data-camporee-launch', 'legado');
    setVisible(true);
  }, [pathname, camporee, scope]);
  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const release = () => {
      if (legado) {
        document.documentElement.removeAttribute('data-camporee-launch');
        window.dispatchEvent(new Event('camporee:launch-finished'));
      }
    };
    const readyTimer = window.setTimeout(() => setReady(true), reduced ? 100 : legado ? 1700 : 1200);
    const dismissTimer = window.setTimeout(() => { setVisible(false); release(); }, reduced ? 180 : legado ? 2300 : 1650);
    return () => { window.clearTimeout(readyTimer); window.clearTimeout(dismissTimer); release(); };
  }, [visible, legado]);
  if (!visible || pathname !== entryPath.current) return null;
  if (legado) return <LegadoLaunch ready={ready}/>;
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
