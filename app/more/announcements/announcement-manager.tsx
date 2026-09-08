'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BellRing, Megaphone, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval } from '@/lib/client-ui';

const labelFor = (priority:string) => priority === 'urgent' ? 'Urgente' : priority === 'important' ? 'Importante' : 'Aviso';

export default function AnnouncementManager({ camporeeId, userId, canEdit, initialAnnouncements }: { camporeeId:string; userId:string; canEdit:boolean; initialAnnouncements:any[] }) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setAnnouncements(initialAnnouncements); }, [initialAnnouncements]);

  async function requestNotifications() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') await Notification.requestPermission();
  }

  async function notifyLocally(title:string, message:string) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const registration = await navigator.serviceWorker?.ready.catch(() => null);
    if (registration) await registration.showNotification(title, { body: message, icon: '/camporee-icon-512.png', badge: '/apple-touch-icon.png', tag: 'camporee-announcement' });
    else new Notification(title, { body: message, icon: '/camporee-icon-512.png' });
  }

  async function saveAnnouncement(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    const message = String(formData.get('message') || '').trim();
    const priority = String(formData.get('priority') || 'normal');
    if (!title || !message) return;
    setSaving(true);
    const { data, error } = await supabase.from('announcements').insert({ camporee_id:camporeeId, title, message, priority, created_by:userId }).select('id,title,message,priority,created_at,created_by').single();
    setSaving(false);
    if (!error && data) {
      setAnnouncements((current) => [data, ...current]);
      setOpen(false);
      router.refresh();
      await notifyLocally(title, message);
    }
  }

  async function removeAnnouncement(id:string) {
    if (!canEdit || !confirmRemoval('este aviso')) return;
    const previous = announcements;
    setAnnouncements((current) => current.filter((item) => item.id !== id));
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) setAnnouncements(previous); else router.refresh();
  }

  return <>
    <div className='panel-tools'>
      <button className='secondary-btn notification-permission-btn' type='button' onClick={requestNotifications}><BellRing size={17}/> Activar avisos en este dispositivo</button>
      {canEdit ? <button className='panel-add' onClick={() => setOpen(true)}><Plus size={18}/> Nuevo aviso</button> : null}
    </div>

    {open ? <div className='sheet-backdrop' onClick={() => setOpen(false)}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Nuevo aviso</h2><form action={saveAnnouncement} className='panel-form'><input name='title' placeholder='Título del aviso' required/><textarea name='message' placeholder='Escribe el mensaje para el club' required/><select name='priority' defaultValue='normal'><option value='normal'>Normal</option><option value='important'>Importante</option><option value='urgent'>Urgente</option></select><button className='primary-btn' disabled={saving}>{saving ? 'Publicando…' : 'Publicar aviso'}</button></form></section></div> : null}

    <section className='panel-list announcements-list'>{announcements.length ? announcements.map((item) => <article className={`panel-row ios-card announcement-row priority-${item.priority}`} key={item.id}><span className='stat-icon stat-gold'>{item.priority === 'urgent' ? <AlertTriangle size={18}/> : <Megaphone size={18}/>}</span><div className='panel-row-copy'><div className='announcement-title-line'><strong>{item.title}</strong><span className={`status-pill ${item.priority === 'urgent' ? 'cancelled' : item.priority === 'important' ? 'pending' : 'confirmed'}`}>{labelFor(item.priority)}</span></div><small className='announcement-message'>{item.message}</small><small>{new Date(item.created_at).toLocaleString('es-DO',{dateStyle:'medium',timeStyle:'short'})}</small></div>{canEdit ? <button className='row-icon-btn danger' onClick={() => removeAnnouncement(item.id)} aria-label='Eliminar aviso'><Trash2 size={16}/></button> : null}</article>) : <div className='empty compact'>No hay avisos publicados. Usa este espacio para cambios de horario, llamados y mensajes importantes.</div>}</section>
  </>;
}
