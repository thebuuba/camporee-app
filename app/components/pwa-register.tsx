'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function PwaRegister() {
  const pathname = usePathname();
  const jobs = useRef(new Set<AbortController>());
  const sessionEpoch = useRef(0);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      void (async () => {
        const registration = await navigator.serviceWorker.getRegistration('/');
        await registration?.unregister();
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => /^camporee-(shell|pages|assets)-/.test(key))
            .map((key) => caches.delete(key)),
        );
      })().catch(() => undefined);
      return;
    }

    let cancelled = false;

    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        if (cancelled) return;
        // Do not block app startup waiting for an update check.
        window.setTimeout(() => {
          void registration.update().catch(() => undefined);
        }, 1500);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      sessionEpoch.current++;
      for (const job of jobs.current) job.abort();
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    if (pathname === '/login' || pathname === '/signup' || pathname.startsWith('/auth/')) {
      sessionEpoch.current++;
      for (const job of jobs.current) job.abort();
      jobs.current.clear();
      let active = true;
      const clear = () => { if (active) navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_PRIVATE_PAGES' }); };
      clear();
      navigator.serviceWorker.addEventListener('controllerchange', clear);
      void navigator.serviceWorker.ready.then(registration => { if (active) registration.active?.postMessage({ type: 'CLEAR_PRIVATE_PAGES' }); }).catch(() => undefined);
      void caches.delete('camporee-pages-v1').catch(() => undefined);
      return () => { active = false; navigator.serviceWorker.removeEventListener('controllerchange', clear); };
    }
    if (pathname === '/offline') return;
    const owner = sessionEpoch.current;
    let preparing = false;
    let refreshPending = false;
    const prepare = async () => {
      if (owner !== sessionEpoch.current || !navigator.onLine || !navigator.serviceWorker.controller) return;
      if (preparing) { refreshPending = true; return; }
      preparing = true;
      const controller = new AbortController();
      jobs.current.add(controller);
      try {
        const response = await fetch(pathname, { headers: { Accept: 'text/html' }, signal: controller.signal });
        if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html')) return;
        const snapshot = new DOMParser().parseFromString(await response.text(), 'text/html');
        // Include the fetched deployment's files, not just chunks loaded before SW control.
        const selector = 'script[src],link[rel="stylesheet"],link[rel="preload"],link[rel="modulepreload"],img[src]';
        const resources = new Set([...Array.from(snapshot.querySelectorAll(selector)), ...Array.from(document.querySelectorAll(selector))].map(element => new URL(element.getAttribute('src') || element.getAttribute('href') || '', location.origin).href).filter(url => new URL(url).origin === location.origin && url !== `${location.origin}/`));
        await Promise.allSettled([...resources].map(url => fetch(url, { signal: controller.signal })));
      } catch { /* An offline visit keeps the last successful snapshot. */ }
      finally {
        preparing = false; jobs.current.delete(controller);
        if (refreshPending) { refreshPending = false; void prepare(); }
      }
    };
    void prepare();
    navigator.serviceWorker.addEventListener('controllerchange', prepare);
    window.addEventListener('online', prepare);
    window.addEventListener('camporee:mutation-success', prepare);
    window.addEventListener('camporee:queue-flushed', prepare);
    return () => { navigator.serviceWorker.removeEventListener('controllerchange', prepare); window.removeEventListener('online', prepare); window.removeEventListener('camporee:mutation-success', prepare); window.removeEventListener('camporee:queue-flushed', prepare); };
  }, [pathname]);

  return null;
}
