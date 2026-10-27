'use client';

import BottomSheet from '@/app/components/bottom-sheet';
import { mutationProblem, mutationNotice } from '@/lib/mutation-result';

import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, MapPin, Pencil, Search, Trash2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';
import { APP_TIME_ZONE, dateKeyInTimeZone, isEventOngoing } from '@/lib/date';
import { camporeeDateTimeInput, camporeeDateTimeIso, formatCamporeeDate } from '@/lib/camporee-locale';

const formatProgramDay = (day:string) => {
  const label = formatCamporeeDate(day,{weekday:'long',day:'numeric',month:'long'});
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export default function ProgramManager({ camporeeId, canEdit, initialEvents, areas, eventMode=false, timeZone=APP_TIME_ZONE }: { camporeeId: string; canEdit: boolean; initialEvents: any[]; areas: any[]; eventMode?: boolean; timeZone?: string }) {
  const localDayKey = (value:string|Date) => dateKeyInTimeZone(value,timeZone);
  const formatTime = (value:string) => new Date(value).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone});
  const toLocalInput = (value?:string|null) => camporeeDateTimeInput(value,timeZone);
  const [events, setEvents] = useState(initialEvents);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [selected, setSelected] = useState<any|null>(null);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'today'|'all'>(eventMode ? 'today' : 'all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [now,setNow] = useState(()=>Date.now());
  const supabase = createClient();
  const router = useRouter();
  const todayKey = localDayKey(new Date(now));
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),15_000);return ()=>window.clearInterval(timer);},[]);

  useEffect(()=>setEvents(initialEvents),[initialEvents]);

  const visible = useMemo(() => events.filter((event) => {
    const matchesText = `${event.title} ${event.location ?? ''} ${event.responsible_name ?? ''}`.toLowerCase().includes(query.toLowerCase());
    const matchesDay = scope === 'all' || localDayKey(event.starts_at) === todayKey;
    return matchesText && matchesDay && (areaFilter === 'all' || event.area_id === areaFilter);
  }), [events, query, scope, areaFilter, todayKey, timeZone]);
  const groups = useMemo(() => visible.reduce((acc:any, event:any) => { const key = localDayKey(event.starts_at); (acc[key] ||= []).push(event); return acc; }, {}), [visible]);

  function closeSheet(){ if(saving)return; setOpen(false); setEditing(null); setFormError(''); }
  function openNew(){ setEditing(null); setFormError(''); setOpen(true); }
  function openEdit(event:any){ setEditing(event); setFormError(''); setOpen(true); }

  async function saveEvent(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    const startsLocal = String(formData.get('starts_at') || '');
    const endsLocal = String(formData.get('ends_at') || '');
    if (!title || !startsLocal){ setFormError('Completa el nombre y la fecha de inicio.'); return; }
    setSaving(true); setFormError('');
    try {
      const startsAt = camporeeDateTimeIso(startsLocal,timeZone)!;
      const endsAt = camporeeDateTimeIso(endsLocal,timeZone);
      if (endsAt && new Date(endsAt) <= new Date(startsAt)){ setFormError('La hora final debe ser posterior al inicio.'); return; }
      const payload = { camporee_id: camporeeId, title, description:String(formData.get('description')||'').trim()||null, location:formData.has('location') ? String(formData.get('location')||'').trim()||null : editing?.location??null, responsible_name:String(formData.get('responsible_name')||'').trim()||null, area_id:String(formData.get('area_id')||'')||null, starts_at:startsAt, ends_at:endsAt };
      const queryBuilder = editing ? supabase.from('schedule_events').update(payload).eq('id', editing.id).eq('camporee_id',camporeeId) : supabase.from('schedule_events').insert(payload);
      const result = await queryBuilder.select('id,title,description,starts_at,ends_at,location,responsible_name,area_id').single();
      const { data } = result; const error = mutationProblem(result,editing?[editing.id]:undefined);
      if(error || !data){ const message=reportMutationError(error,'No se pudo guardar la actividad del programa.'); setFormError(message); return; }
      setEvents((current) => (editing ? current.map((item) => item.id === data.id ? data : item) : [...current, data]).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))));
      setEditing(null); setOpen(false); reportMutationSuccess(mutationNotice(result.status,editing?'Actividad actualizada.':'Actividad agregada al programa.')); if (result.status !== 202) router.refresh();
    } catch(error){ const message=reportMutationError(error,'No se pudo guardar la actividad del programa.'); setFormError(message); }
    finally{ setSaving(false); }
  }

  async function removeEvent(id: string) {
    if (!canEdit || !confirmRemoval('esta actividad')) return;
    try {
      const result = await supabase.from('schedule_events').delete().eq('id', id).eq('camporee_id',camporeeId).select('id');
      const error = mutationProblem(result,[id]);
      if(error) throw error;
      setEvents((current) => current.filter((item) => item.id !== id)); reportMutationSuccess(mutationNotice(result.status,'Actividad eliminada.')); if (result.status !== 202) router.refresh();
    } catch(error){ reportMutationError(error,'No se pudo eliminar la actividad.'); }
  }
  const formEvent = editing;

  return <>
    <BottomSheet open={Boolean(selected)} onClose={()=>setSelected(null)} title={selected?.title || ''} description={selected ? formatProgramDay(localDayKey(selected.starts_at)) : ''} footer={canEdit && selected ? <button type="button" className="primary-btn" onClick={()=>{const item=selected;setSelected(null);openEdit(item)}}><Pencil size={16}/> Editar actividad</button> : undefined}>
      {selected ? <div className="pm-sheet-detail">{selected.description ? <p>{selected.description}</p> : null}<div className="pm-detail-item"><div><small>Horario</small><strong>{formatTime(selected.starts_at)}{selected.ends_at ? ` – ${formatTime(selected.ends_at)}` : ''}</strong></div></div>{selected.location ? <div className="pm-detail-item"><MapPin size={20}/><div><small>Lugar</small><strong>{selected.location}</strong></div></div> : null}{selected.responsible_name ? <div className="pm-detail-item"><UserRound size={20}/><div><small>Responsable</small><strong>{selected.responsible_name}</strong></div></div> : null}</div> : null}
    </BottomSheet>
    <div className='program-filter-bar' aria-label='Filtros del programa'>
      <div className='program-scope-switch' role='tablist' aria-label='Vista del programa'>
        <button type='button' className={scope==='today'?'active':''} onClick={()=>setScope('today')} aria-pressed={scope==='today'}>Hoy</button>
        <button type='button' className={scope==='all'?'active':''} onClick={()=>setScope('all')} aria-pressed={scope==='all'}>Todo el evento</button>
      </div>
    </div>
    <div className='filter-chips polymet-program-areas'><button type='button' className={areaFilter==='all'?'active':''} onClick={()=>setAreaFilter('all')}>Todas</button>{areas.map((area)=><button type='button' key={area.id} className={areaFilter===area.id?'active':''} onClick={()=>setAreaFilter(area.id)}>{area.name}</button>)}</div>
    <div className='panel-tools'><label className='panel-search'><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder='Buscar actividad, lugar o responsable'/>{query ? <button type='button' onClick={()=>setQuery('')}>×</button> : null}</label>{canEdit ? <button type='button' className='panel-add' onClick={openNew}><CalendarPlus size={18}/> Actividad</button> : null}</div>
    <BottomSheet open={Boolean(open)} onClose={closeSheet} title={<>{editing ? 'Editar actividad' : 'Nueva actividad'}</>} busy={saving}><form onSubmit={(event)=>{event.preventDefault();void saveEvent(new FormData(event.currentTarget));}} className="panel-form program-activity-form pm-sheet-form"><div className="pm-sheet-fields">{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<label className="pm-field"><span>Actividad <b className="pm-required">*</b></span><input name='title' defaultValue={formEvent?.title ?? ''}  required/></label><label className="pm-field"><span>Descripción</span><textarea name='description' defaultValue={formEvent?.description ?? ''} /></label><div className='form-two program-date-fields'><label className='pm-field'><span>Inicio</span><input name='starts_at' type='datetime-local' defaultValue={toLocalInput(formEvent?.starts_at)} required/></label><label className='pm-field'><span>Fin</span><input name='ends_at' type='datetime-local' defaultValue={toLocalInput(formEvent?.ends_at)}/></label></div>{editing ? <label className="pm-field"><span>Lugar</span><input name='location' defaultValue={formEvent?.location ?? ''} /></label> : null}<label className="pm-field"><span>Responsable</span><input name='responsible_name' defaultValue={formEvent?.responsible_name ?? ''} /></label><label className="pm-field"><span>Área</span><select name='area_id' defaultValue={formEvent?.area_id ?? ''}><option value=''>Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label></div><div className="pm-sheet-footer"><button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div></form></BottomSheet>
    <section className='program-days'>{Object.keys(groups).length ? Object.entries(groups).map(([day, rows]:any) => <section className='program-day' key={day}>
      <div className='program-day-head'><span className='polymet-day-badge'>{formatCamporeeDate(day,{weekday:'short'}).slice(0,3)}<b>{Number(day.slice(-2))}</b></span><div><strong>{formatProgramDay(day)}</strong><span>{rows.length} {rows.length === 1 ? 'actividad' : 'actividades'}</span></div></div>
      <div className='panel-list'>{rows.map((event:any) => {const ongoing=isEventOngoing(event,now);const area=areas.find((item)=>item.id===event.area_id);return <article className={`panel-row ios-card program-row ${ongoing?'is-ongoing':''}`} key={event.id}>
        <span className='polymet-event-time'><b>{formatTime(event.starts_at)}</b><small>{event.ends_at?formatTime(event.ends_at):''}</small></span>
        <div className='panel-row-copy' role="button" tabIndex={0} onClick={()=>setSelected(event)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(event)}}}><div className='polymet-event-tags'>{ongoing?<span>● En curso</span>:null}{area?<span>{area.name}</span>:null}</div><strong>{event.title}</strong><div className='polymet-event-meta'>{event.location ? <small><MapPin size={13}/>{event.location}</small> : null}{event.responsible_name ? <small><UserRound size={13}/>{event.responsible_name}</small> : null}</div></div>
        {canEdit ? <div className='row-actions program-actions'><button type='button' className='row-icon-btn' onClick={()=>openEdit(event)} aria-label='Editar'><Pencil size={15}/></button><button type='button' className='row-icon-btn danger' onClick={() => removeEvent(event.id)} aria-label='Eliminar'><Trash2 size={16}/></button></div> : null}
      </article>})}</div>
    </section>) : <div className='empty compact'>{scope === 'today' ? 'No hay actividades programadas para hoy. Cambia el filtro a Todo o agrega una actividad.' : 'Todavía no hay actividades. Agrega el culto, comidas, eventos y demás momentos del camporee.'}</div>}</section>
  </>;
}
