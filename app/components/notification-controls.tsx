'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, ExternalLink, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type NotificationState = 'checking' | 'unsupported' | 'default' | 'denied' | 'granted' | 'ready';
type Props = { camporeeId:string; userId:string; mode:'prompt'|'settings' };

function urlBase64ToUint8Array(value:string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function isStandalone() {
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

export default function NotificationControls({ camporeeId, userId, mode }: Props) {
  const [state,setState] = useState<NotificationState>('checking');
  const [busy,setBusy] = useState(false);
  const [dismissed,setDismissed] = useState(true);
  const [standalone,setStandalone] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    const installed = isStandalone();
    setStandalone(installed);
    if (!supported) { setState('unsupported'); setDismissed(false); return; }

    const permission = Notification.permission;
    if (permission === 'denied') { setState('denied'); setDismissed(false); return; }
    if (permission === 'default') {
      setState('default');
      const hidden = sessionStorage.getItem('camporee-notification-prompt-dismissed') === '1';
      setDismissed(hidden);
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => { setState(subscription ? 'ready' : 'granted'); setDismissed(false); })
      .catch(() => { setState('granted'); setDismissed(false); });
  }, []);

  async function activate() {
    if (busy) return;
    setBusy(true);
    try {
      const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (!supported) { setState('unsupported'); return; }

      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission === 'denied') { setState('denied'); return; }
      if (permission !== 'granted') { setState('default'); return; }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const { data:keyData, error:keyError } = await supabase.functions.invoke('camporee-push', { body:{ action:'public-key' } });
        if (keyError || !keyData?.publicKey) throw keyError ?? new Error('No push key');
        subscription = await registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(keyData.publicKey) });
      }

      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('Push subscription keys unavailable');
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id:userId,
        camporee_id:camporeeId,
        endpoint:subscription.endpoint,
        p256dh:json.keys.p256dh,
        auth:json.keys.auth,
        updated_at:new Date().toISOString(),
      }, { onConflict:'endpoint' });
      if (error) throw error;
      setState('ready');
      setDismissed(false);
    } catch (error) {
      console.error('Notification activation failed', error);
      setState(Notification.permission === 'denied' ? 'denied' : 'granted');
    } finally {
      setBusy(false);
    }
  }

  function dismissPrompt() {
    sessionStorage.setItem('camporee-notification-prompt-dismissed','1');
    setDismissed(true);
  }

  if (mode === 'prompt') {
    if (!standalone || state === 'checking' || state === 'ready' || state === 'denied' || state === 'unsupported' || dismissed) return null;
    return <section className='notification-prompt ios-card'>
      <button className='notification-prompt-close' type='button' onClick={dismissPrompt} aria-label='Cerrar'><X size={17}/></button>
      <span className='notification-prompt-icon'><BellRing size={22}/></span>
      <div className='notification-prompt-copy'><strong>Activa las notificaciones</strong><span>Recibe avisos, recordatorios del camporee y cambios importantes aunque la app esté cerrada.</span></div>
      <div className='notification-prompt-actions'><button className='primary-btn' type='button' onClick={activate} disabled={busy}>{busy?'Activando…':'Activar'}</button><button className='secondary-btn' type='button' onClick={dismissPrompt}>Ahora no</button></div>
    </section>;
  }

  const title = state === 'ready' ? 'Notificaciones activadas' : state === 'denied' ? 'Notificaciones bloqueadas' : state === 'unsupported' ? 'Notificaciones no disponibles' : 'Notificaciones desactivadas';
  const detail = state === 'ready'
    ? 'Este dispositivo puede recibir avisos y recordatorios del camporee.'
    : state === 'denied'
      ? 'El permiso está bloqueado en el sistema. Debes habilitar las notificaciones de Camporee en los ajustes del dispositivo.'
      : state === 'unsupported'
        ? 'Este navegador o dispositivo no admite notificaciones push para esta app.'
        : standalone
          ? 'Actívalas para recibir avisos, recordatorios y cambios importantes.'
          : 'En iPhone, añade Camporee a la pantalla de inicio y ábrela desde allí para activar notificaciones.';

  return <section className={`notification-settings ios-card state-${state}`}>
    <span className='notification-settings-icon'>{state==='ready'?<CheckCircle2 size={22}/>:<BellRing size={22}/>}</span>
    <div className='notification-settings-copy'><strong>{title}</strong><span>{detail}</span></div>
    {state !== 'ready' && state !== 'unsupported' && state !== 'denied' ? <button className='secondary-btn' type='button' onClick={activate} disabled={busy}>{busy?'Activando…':'Activar'}</button> : null}
    {state === 'denied' ? <span className='notification-settings-hint'><ExternalLink size={14}/> Ajustes del dispositivo</span> : null}
  </section>;
}
