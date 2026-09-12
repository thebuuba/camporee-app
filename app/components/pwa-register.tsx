'use client';

import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      void (async () => {
        const registration = await navigator.serviceWorker.getRegistration('/');
        await registration?.unregister();
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith('camporee-shell-'))
            .map((key) => caches.delete(key)),
        );
      })().catch(() => undefined);
      return;
    }
    let cancelled = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        if (!cancelled) await registration.update().catch(() => undefined);
      } catch {
        // The app still works without service worker support.
      }
    };
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
    };
  }, []);
  return null;
}
