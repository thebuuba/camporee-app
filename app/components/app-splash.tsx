'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { launchSchedule, launchScope, type LaunchCamporee } from '@/lib/legado-launch';
import type {} from '@/lib/launch-bootstrap';
import LegadoLaunch from './legado-launch';

/** Rendered in the initial HTML; the head script chooses it before paint. */
export default function AppSplash() {
  const pathname = usePathname();
  useEffect(() => {
    // Public redirects release an existing cover, never create another one.
    if (launchScope(pathname) || pathname === '/offline' || pathname === '/' || /^\/(tasks|program|more|search)(\/|$)/.test(pathname)) return;
    window.__camporeeLaunch?.ready();
  }, [pathname]);
  return <div id="camporee-launch" className="app-launch">
    <LegadoLaunch/>
    <div className="app-launch-generic" role="status" aria-label="Cargando Camporee">
      <img src="/camporee-logo-v8.png?v=11" width="144" height="144" alt=""/>
      <div className="legado-launch-loading"><span aria-hidden="true"/><small>Preparando tu camporee…</small></div>
    </div>
  </div>;
}

/** Place after resolved content, inside the same Suspense boundary. */
export function CamporeeLaunchReady({ camporee, scope }: { camporee: LaunchCamporee; scope: string }) {
  const { name, theme, status, starts_on, ends_on, time_zone } = camporee;
  useEffect(() => {
    const schedule = launchSchedule({ name, theme, status, starts_on, ends_on, time_zone });
    try {
      window.localStorage.setItem(`camporee:launch:${scope}`, JSON.stringify(schedule));
      window.localStorage.setItem('camporee:launch:last-scope', scope);
    } catch { /* Branding is optional when storage is unavailable. */ }
    window.__camporeeLaunch?.event(schedule, scope);
    window.__camporeeLaunch?.ready();
  }, [scope, name, theme, status, starts_on, ends_on, time_zone]);
  return null;
}
