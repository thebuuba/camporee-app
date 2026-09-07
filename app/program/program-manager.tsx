'use client';

import { useState } from 'react';
import { CalendarPlus, Clock3, MapPin, Trash2, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ProgramManager({ camporeeId, canEdit, initialEvents, areas }: { camporeeId: string; canEdit: boolean; initialEvents: any[]; areas: any[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function addEvent(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    const startsAt = String(formData.get('starts_at') || '');
    if (!title || !startsAt) return;
    setSaving(true);
    const payload = {
      camporee_id: camporeeId,
      title,
      description: String(formData.get('description') || '').trim() || null,
      location: String(formData.get('location') || '').trim() || null,
      responsible_name: String(formData.get('responsible_name') || '').trim() || null,
      area_id: String(formData.get('area_id') || '') || null,
      starts_at: startsAt,
      ends_at: String(formData.get('ends_at') || '') || null
    };
    const { data, error } = await supabase.from('schedule_events').insert(payload).select('id,title,description,starts_at,ends_at,location,responsible_name,area_id').single();
    setSaving(false);
    if (!error && data) {
      setEvents((current) => [...current, data].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))));
      setOpen(false);
    }
  }

  async function removeEvent(id: string) {
    if (!canEdit) return;
    const { error } = await supabase.from('schedule_events').delete().eq('id', id);
    if (!error) setEvents((current) => current.filter((item) => item.id !== id));
  }

  return <>
    {canEdit ? <button className='panel-add' onClick={() => setOpen(true)}><CalendarPlus size={18}/> Nueva actividad</button> : null}
    {open ? <div className='sheet-backdrop' onClick={() => setOpen(false)}><section className='sheet-card' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Nueva actividad</h2><form action={addEvent} className='panel-form'><input name='title' placeholder='Nombre de la actividad' required/><textarea name='description' placeholder='Descripción opcional'/><div className='form-two'><input name='starts_at' type='datetime-local' required/><input name='ends_at' type='datetime-local'/></div><input name='location' placeholder='Lugar'/><input name='responsible_name' placeholder='Responsable'/><select name='area_id' defaultValue=''><option value=''>Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><button className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Agregar al programa'}</button></form></section></div> : null}
    <section className='panel-list'>{events.length ? events.map((event) => <article className='panel-row ios-card program-row' key={event.id}><span className='stat-icon stat-gold'><Clock3 size={18}/></span><div className='panel-row-copy'><strong>{event.title}</strong><small>{new Date(event.starts_at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })}</small>{event.location ? <small className='meta-line'><MapPin size={13}/>{event.location}</small> : null}{event.responsible_name ? <small className='meta-line'><UserRound size={13}/>{event.responsible_name}</small> : null}</div>{canEdit ? <button className='row-icon-btn danger' onClick={() => removeEvent(event.id)}><Trash2 size={17}/></button> : null}</article>) : <div className='empty compact'>Todavía no hay actividades. Agrega el culto, comidas, eventos y demás momentos del camporee.</div>}</section>
  </>;
}
