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

    void navigator.serviceWorker
      .register('/sw.js')
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
    };
  }, []);

  return null;
}
