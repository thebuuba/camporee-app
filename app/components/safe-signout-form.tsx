'use client';

import {useState, type FormEvent, type ReactNode} from 'react';
import {getOfflineQueueCount} from '@/lib/offline-fetch';

// Signing out clears local storage for privacy. Ask before irreversibly
// clearing unsynced writes, rather than silently losing camporee changes.
export default function SafeSignoutForm({
  className,children,
}:{className?:string;children:ReactNode}) {
  const [checking,setChecking]=useState(false);
  async function signout(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(checking)return;
    const form=event.currentTarget;
    setChecking(true);
    try {
      const pending=await getOfflineQueueCount();
      if(pending>0 && !window.confirm(
        `Hay ${pending} cambio(s) pendiente(s) de sincronizar en este dispositivo.\n\n`+
        'Cerrar sesión eliminará estos cambios locales por seguridad. '+
        'Pulsa Cancelar y sincronízalos antes de salir.\n\n¿Salir y descartar los cambios pendientes?',
      ))return;
      form.submit();
    } catch {
      window.alert('No se pudo verificar la cola de sincronización. Recarga la aplicación antes de cerrar sesión.');
    } finally {setChecking(false);}
  }
  return <form action="/auth/signout" method="post" className={className} onSubmit={signout} aria-busy={checking}>
    {children}
  </form>;
}
