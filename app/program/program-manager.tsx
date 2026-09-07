'use client';

import { useMemo, useState } from 'react';
import { CalendarPlus, Clock3, MapPin, Pencil, Search, Trash2, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ProgramManager({ camporeeId, canEdit, initialEvents, areas }: { camporeeId: string; canEdit: boolean; initialEvents: any[]; areas: any[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const supabase = createClient();

  const visible = useMemo(() => events.filter((event) => `${event.title} ${event.location ?? ''} ${event.responsible_name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [events, query]);
  const groups = useMemo(() => visible.reduce((acc:any, event:any) => { const key = String(event.starts_at).slice(0,10); (acc[key] ||= []).push(event); return acc; }, {}), [visible]);

  async function saveEvent(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    const startsAt = String(formData.get('starts_at') || '');
    if (!title || !startsAt) return;
    setSaving(true);
    const payload = { camporee_id: camporeeId, title, description:String(formData.get('description')||'').trim()||null, location:String(formData.get('location')||'').trim()||null, responsible_name:String(formData.get('responsible_name')||'').trim()||null, area_id:String(formData.get('area_id')||'')||null, starts_at:startsAt, ends_at:String(formData.get('ends_at')||'')||null };
    const queryBuilder = editing ? supabase.from('schedule_events').update(payload).eq('id', editing.id) : supabase.from('schedule_events').insert(payload);
    const { data, error } = await queryBuilder.select('id,title,description,starts_at,ends_at,location,responsible_name,area_id').single();
    setSaving(false);
    if (!error && data) {
      setEvents((current) => (editing ? current.map((item) => item.id === data.id ? data : item) : [...current, data]).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))));
      setEditing(null); setOpen(false);
    }
  }

  async function removeEvent(id: string) { if (!canEdit) return; const { error } = await supabase.from('schedule_events').delete().eq('id', id); if (!error) setEvents((current) => current.filter((item) => item.id !== id)); }
  const formEvent = editing;
  const localInput = (value?:string|null) => value ? new Date(value).toISOString().slice(0,16) : '';

  return <>
    <div className='panel-tools'><label className='panel-search'><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder='Buscar actividad, lugar o responsable'/>{query ? <button type='button' onClick={()=>setQuery('')}>×</button> : null}</label>{canEdit ? <button className='panel-add' onClick={() => {setEditing(null);setOpen(true)}}><CalendarPlus size={18}/> Nueva actividad</button> : null}</div>
    {open ? <div className='sheet-backdrop' onClick={() => {setOpen(false);setEditing(null)}}><section className='sheet-card' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>{editing ? 'Editar actividad' : 'Nueva actividad'}</h2><form action={saveEvent} className='panel-form'><input name='title' defaultValue={formEvent?.title ?? ''} placeholder='Nombre de la actividad' required/><textarea name='description' defaultValue={formEvent?.description ?? ''} placeholder='Descripción opcional'/><div className='form-two'><input name='starts_at' type='datetime-local' defaultValue={localInput(formEvent?.starts_at)} required/><input name='ends_at' type='datetime-local' defaultValue={localInput(formEvent?.ends_at)}/></div><input name='location' defaultValue={formEvent?.location ?? ''} placeholder='Lugar'/><input name='responsible_name' defaultValue={formEvent?.responsible_name ?? ''} placeholder='Responsable'/><select name='area_id' defaultValue={formEvent?.area_id ?? ''}><option value=''>Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><button className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar al programa'}</button></form></section></div> : null}
    <section className='program-days'>{Object.keys(groups).length ? Object.entries(groups).map(([day, rows]:any) => <section className='program-day' key={day}><div className='program-day-head'><strong>{new Date(`${day}T00:00:00`).toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long'})}</strong><span>{rows.length} actividades</span></div><div className='panel-list'>{rows.map((event:any) => <article className='panel-row ios-card program-row' key={event.id}><span className='stat-icon stat-gold'><Clock3 size={18}/></span><div className='panel-row-copy'><strong>{event.title}</strong><small>{new Date(event.starts_at).toLocaleTimeString('es-DO',{hour:'numeric',minute:'2-digit'})}{event.ends_at ? ` – ${new Date(event.ends_at).toLocaleTimeString('es-DO',{hour:'numeric',minute:'2-digit'})}` : ''}</small>{event.location ? <small className='meta-line'><MapPin size={13}/>{event.location}</small> : null}{event.responsible_name ? <small className='meta-line'><UserRound size={13}/>{event.responsible_name}</small> : null}</div>{canEdit ? <div className='row-actions'><button className='row-icon-btn' onClick={()=>{setEditing(event);setOpen(true)}} aria-label='Editar'><Pencil size={16}/></button><button className='row-icon-btn danger' onClick={() => removeEvent(event.id)} aria-label='Eliminar'><Trash2 size={17}/></button></div> : null}</article>)}</div></section>) : <div className='empty compact'>Todavía no hay actividades. Agrega el culto, comidas, eventos y demás momentos del camporee.</div>}</section>
  </>;
}
