'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCheck, ClipboardCheck, Plus, Search, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

const typeLabel = (value:string) => ({departure:'Salida',arrival:'Llegada',activity:'Actividad',worship:'Culto',night:'Noche',return:'Regreso',general:'General'} as Record<string,string>)[value] || 'General';

export default function AttendanceManager({ camporeeId, userId, canEdit, participants, initialSessions }: { camporeeId:string; userId:string; canEdit:boolean; participants:any[]; initialSessions:any[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSession, setActiveSession] = useState<any|null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [formError,setFormError]=useState('');
  const [query, setQuery] = useState('');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    setSessions(initialSessions);
    setActiveSession((current:any) => current ? initialSessions.find((session:any) => session.id === current.id) ?? current : null);
  }, [initialSessions]);

  const activeMarks = useMemo(() => new Map((activeSession?.attendance_marks || []).map((mark:any) => [mark.participant_id, Boolean(mark.present)])), [activeSession]);
  const presentCount = activeSession ? participants.filter((p) => activeMarks.get(p.id)).length : 0;
  const visibleParticipants = useMemo(() => participants.filter((person) => `${person.full_name} ${person.unit_name || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [participants,query]);

  async function createSession(formData:FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title){setFormError('Escribe un nombre para el pase de lista.');return;}
    setSaving(true);setFormError('');
    try{
      const occurred=String(formData.get('occurred_at') || '');
      const payload = { camporee_id:camporeeId, title, session_type:String(formData.get('session_type') || 'general'), occurred_at:occurred ? new Date(occurred).toISOString() : new Date().toISOString(), created_by:userId };
      const { data, error } = await supabase.from('attendance_sessions').insert(payload).select('id,title,session_type,occurred_at,created_at').single();
      if(error||!data){const message=reportMutationError(error,'No se pudo crear el pase de lista.');setFormError(message);return;}
      const hydrated={...data,attendance_marks:[]}; setSessions((current)=>[hydrated,...current]); setActiveSession(hydrated); setOpen(false); reportMutationSuccess('Pase de lista creado.'); router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo crear el pase de lista.');setFormError(message)}finally{setSaving(false)}
  }

  const updatePersonMark = (marks:any[], participantId:string, mark:any) => [...marks.filter((m:any)=>m.participant_id!==participantId),mark];

  async function toggleParticipant(person:any) {
    if (!canEdit || !activeSession || bulkSaving) return;
    const sessionId=activeSession.id; const previous=Boolean(activeMarks.get(person.id)); const next=!previous; const optimistic={participant_id:person.id,present:next};
    setActiveSession((current:any)=>current&&current.id===sessionId?{...current,attendance_marks:updatePersonMark(current.attendance_marks||[],person.id,optimistic)}:current);
    setSessions((current)=>current.map((session)=>session.id===sessionId?{...session,attendance_marks:updatePersonMark(session.attendance_marks||[],person.id,optimistic)}:session));
    const { data,error }=await supabase.from('attendance_marks').upsert({session_id:sessionId,participant_id:person.id,present:next},{onConflict:'session_id,participant_id'}).select('participant_id,present').single();
    if(error||!data){const rollback={participant_id:person.id,present:previous};setActiveSession((current:any)=>current&&current.id===sessionId?{...current,attendance_marks:updatePersonMark(current.attendance_marks||[],person.id,rollback)}:current);setSessions((current)=>current.map((session)=>session.id===sessionId?{...session,attendance_marks:updatePersonMark(session.attendance_marks||[],person.id,rollback)}:session));reportMutationError(error,'No se pudo guardar la asistencia.');return;}
    setActiveSession((current:any)=>current&&current.id===sessionId?{...current,attendance_marks:updatePersonMark(current.attendance_marks||[],person.id,data)}:current); setSessions((current)=>current.map((session)=>session.id===sessionId?{...session,attendance_marks:updatePersonMark(session.attendance_marks||[],person.id,data)}:session));
  }

  async function markAllPresent() {
    if (!canEdit || !activeSession || bulkSaving || !participants.length) return;
    const sessionId=activeSession.id; const previous=activeSession.attendance_marks || [];
    const marks=participants.map((person)=>({participant_id:person.id,present:true})); setBulkSaving(true);
    setActiveSession((current:any)=>current&&current.id===sessionId?{...current,attendance_marks:marks}:current); setSessions((current)=>current.map((session)=>session.id===sessionId?{...session,attendance_marks:marks}:session));
    const payload=participants.map((person)=>({session_id:sessionId,participant_id:person.id,present:true})); const { error }=await supabase.from('attendance_marks').upsert(payload,{onConflict:'session_id,participant_id'}); setBulkSaving(false);
    if(error){setActiveSession((current:any)=>current&&current.id===sessionId?{...current,attendance_marks:previous}:current);setSessions((current)=>current.map((session)=>session.id===sessionId?{...session,attendance_marks:previous}:session));reportMutationError(error,'No se pudo marcar a todos como presentes.');return;} reportMutationSuccess('Asistencia actualizada.');router.refresh();
  }

  if (activeSession) return <>
    <div className='attendance-live-head ios-card'><div><small>{typeLabel(activeSession.session_type)}</small><h2>{activeSession.title}</h2><span>{presentCount}/{participants.length} presentes</span></div><button type='button' className='secondary-btn' onClick={()=>{setActiveSession(null);setQuery('')}}>Terminar</button></div>
    <div className='panel-tools attendance-live-tools'><label className='panel-search'><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder='Buscar participante o unidad'/>{query?<button type='button' onClick={()=>setQuery('')} aria-label='Limpiar'><X size={16}/></button>:null}</label>{canEdit&&presentCount<participants.length?<button className='secondary-btn attendance-mark-all' type='button' onClick={markAllPresent} disabled={bulkSaving}><CheckCheck size={17}/>{bulkSaving?'Marcando…':'Todos presentes'}</button>:null}</div>
    <section className='panel-list attendance-live-list'>{visibleParticipants.length?visibleParticipants.map((person)=>{const present=Boolean(activeMarks.get(person.id));return <button type='button' className={`panel-row ios-card attendance-person ${present?'is-present':''}`} onClick={()=>toggleParticipant(person)} key={person.id} disabled={!canEdit||bulkSaving}><span className='attendance-check'>{present?<Check size={18}/>:null}</span><div className='panel-row-copy'><strong>{person.full_name}</strong><small>{person.unit_name||'Sin unidad'}</small></div><span className={`status-pill ${present?'confirmed':'pending'}`}>{present?'Presente':'Falta'}</span></button>}):<div className='empty compact'>No hay participantes que coincidan con la búsqueda.</div>}</section>
  </>;

  return <>
    <div className='panel-tools'>{canEdit?<button type='button' className='panel-add' onClick={()=>{setFormError('');setOpen(true)}}><Plus size={18}/> Nuevo pase de lista</button>:null}</div>
    {open?<div className='sheet-backdrop' onClick={()=>{if(!saving)setOpen(false)}}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e)=>e.stopPropagation()}><div className='sheet-handle'/><h2>Nuevo pase de lista</h2><form onSubmit={(event)=>{event.preventDefault();void createSession(new FormData(event.currentTarget));}} className='panel-form'>{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<input name='title' placeholder='Ej. Salida hacia el culto' required/><select name='session_type' defaultValue='general'><option value='general'>General</option><option value='departure'>Salida</option><option value='arrival'>Llegada</option><option value='activity'>Actividad</option><option value='worship'>Culto</option><option value='night'>Noche</option><option value='return'>Regreso</option></select><input name='occurred_at' type='datetime-local'/><button type='submit' className='primary-btn' disabled={saving}>{saving?'Creando…':'Comenzar pase'}</button></form></section></div>:null}
    <section className='panel-list'>{sessions.length?sessions.map((session)=>{const count=(session.attendance_marks||[]).filter((m:any)=>m.present).length;return <button type='button' className='panel-row ios-card attendance-session-row' onClick={()=>setActiveSession(session)} key={session.id}><span className='stat-icon stat-blue'><ClipboardCheck size={18}/></span><div className='panel-row-copy'><strong>{session.title}</strong><small>{typeLabel(session.session_type)} · {new Date(session.occurred_at).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short'})}</small><small><Users size={12}/>{count}/{participants.length} presentes</small></div><span className='chevron'>›</span></button>}):<div className='empty compact'>Todavía no hay pases de lista. Crea uno al salir, llegar o antes de una actividad.</div>}</section>
  </>;
}
