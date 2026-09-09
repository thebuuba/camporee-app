'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BellRing, Megaphone, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval } from '@/lib/client-ui';

const labelFor = (priority:string) => priority === 'urgent' ? 'Urgente' : priority === 'important' ? 'Importante' : 'Aviso';

function urlBase64ToUint8Array(value:string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export default function AnnouncementManager({ camporeeId, userId, canEdit, initialAnnouncements }: { camporeeId:string; userId:string; canEdit:boolean; initialAnnouncements:any[] }) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notificationPermission,setNotificationPermission] = useState<'default'|'denied'|'granted'|'unsupported'>('default');
  const [pushReady,setPushReady] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setAnnouncements(initialAnnouncements); }, [initialAnnouncements]);
  useEffect(() => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setNotificationPermission(supported ? Notification.permission : 'unsupported');
    if (!supported) return;
    navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setPushReady(Boolean(subscription))).catch(() => setPushReady(false));
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`camporee-announcements-${camporeeId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'announcements', filter:`camporee_id=eq.${camporeeId}` }, (payload:any) => {
        const item = payload.new;
        setAnnouncements((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]);
      })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'announcements' }, (payload:any) => {
        const id = payload.old?.id;
        if (id) setAnnouncements((current) => current.filter((row) => row.id !== id));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [camporeeId,supabase]);

  async function requestNotifications() {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    if (!supported) { setNotificationPermission('unsupported'); return; }

    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    setNotificationPermission(permission);
    if (permission !== 'granted') return;

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const { data:keyData, error:keyError } = await supabase.functions.invoke('camporee-push', { body:{ action:'public-key' } });
        if (keyError || !keyData?.publicKey) throw keyError ?? new Error('No push key');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:urlBase64ToUint8Array(keyData.publicKey),
        });
      }
      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!p256dh || !auth) throw new Error('Push subscription keys unavailable');
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id:userId,
        camporee_id:camporeeId,
        endpoint:subscription.endpoint,
        p256dh,
        auth,
        updated_at:new Date().toISOString(),
      }, { onConflict:'endpoint' });
      if (error) throw error;
      setPushReady(true);
    } catch (error) {
      console.error('Camporee push subscription failed', error);
      setPushReady(false);
    }
  }

  async function saveAnnouncement(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    const message = String(formData.get('message') || '').trim();
    const priority = String(formData.get('priority') || 'normal');
    if (!title || !message) return;
    setSaving(true);
    const { data, error } = await supabase.from('announcements').insert({ camporee_id:camporeeId, title, message, priority, created_by:userId }).select('id,camporee_id,title,message,priority,created_at,created_by').single();
    setSaving(false);
    if (!error && data) {
      setAnnouncements((current) => current.some((item)=>item.id===data.id) ? current : [data, ...current]);
      setOpen(false);
      router.refresh();
      if (navigator.onLine) {
        void supabase.functions.invoke('camporee-push', { body:{ action:'send', camporeeId, title, message, priority } }).then(({error:pushError}) => {
          if (pushError) console.error('Camporee push delivery failed', pushError);
        });
      }
    }
  }

  async function removeAnnouncement(id:string) {
    if (!canEdit || !confirmRemoval('este aviso')) return;
    const previous = announcements;
    setAnnouncements((current) => current.filter((item) => item.id !== id));
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) setAnnouncements(previous); else router.refresh();
  }

  const notificationLabel = notificationPermission === 'granted' && pushReady ? 'Avisos activados' : notificationPermission === 'denied' ? 'Avisos bloqueados en este dispositivo' : notificationPermission === 'unsupported' ? 'Avisos no disponibles' : notificationPermission === 'granted' ? 'Completar activación de avisos' : 'Activar avisos en este dispositivo';

  return <>
    <div className='panel-tools'>
      <button className={`secondary-btn notification-permission-btn ${notificationPermission==='granted'&&pushReady?'is-active':''}`} type='button' onClick={requestNotifications} disabled={notificationPermission==='unsupported'}><BellRing size={17}/> {notificationLabel}</button>
      {canEdit ? <button className='panel-add' onClick={() => setOpen(true)}><Plus size={18}/> Nuevo aviso</button> : null}
    </div>

    {open ? <div className='sheet-backdrop' onClick={() => setOpen(false)}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Nuevo aviso</h2><form action={saveAnnouncement} className='panel-form'><input name='title' placeholder='Título del aviso' required/><textarea name='message' placeholder='Escribe el mensaje para el club' required/><select name='priority' defaultValue='normal'><option value='normal'>Normal</option><option value='important'>Importante</option><option value='urgent'>Urgente</option></select><button className='primary-btn' disabled={saving}>{saving ? 'Publicando…' : 'Publicar aviso'}</button></form></section></div> : null}

    <section className='panel-list announcements-list'>{announcements.length ? announcements.map((item) => <article className={`panel-row ios-card announcement-row priority-${item.priority}`} key={item.id}><span className='stat-icon stat-gold'>{item.priority === 'urgent' ? <AlertTriangle size={18}/> : <Megaphone size={18}/>}</span><div className='panel-row-copy'><div className='announcement-title-line'><strong>{item.title}</strong><span className={`status-pill ${item.priority === 'urgent' ? 'cancelled' : item.priority === 'important' ? 'pending' : 'confirmed'}`}>{labelFor(item.priority)}</span></div><small className='announcement-message'>{item.message}</small><small>{new Date(item.created_at).toLocaleString('es-DO',{dateStyle:'medium',timeStyle:'short'})}</small></div>{canEdit ? <button className='row-icon-btn danger' onClick={() => removeAnnouncement(item.id)} aria-label='Eliminar aviso'><Trash2 size={16}/></button> : null}</article>) : <div className='empty compact'>No hay avisos publicados. Usa este espacio para cambios de horario, llamados y mensajes importantes.</div>}</section>
  </>;
}
