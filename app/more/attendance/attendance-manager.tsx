'use client';

import BottomSheet from '@/app/components/bottom-sheet';
import { mutationProblem, mutationNotice } from '@/lib/mutation-result';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCheck, ClipboardCheck, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';
import { camporeeDateTimeIso } from '@/lib/camporee-locale';

const typeLabel = (value:string) => ({departure:'Salida',arrival:'Llegada',activity:'Actividad',worship:'Culto',night:'Noche',return:'Regreso',general:'General'} as Record<string,string>)[value] || 'General';

export default function AttendanceManager({ camporeeId, userId, canEdit, participants, initialSessions, timeZone = 'America/Santo_Domingo' }: { camporeeId:string; userId:string; canEdit:boolean; participants:any[]; initialSessions:any[]; timeZone?:string }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSession, setActiveSession] = useState<any|null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [formError,setFormError]=useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  // ponytail: one local queue prevents bulk/individual races; use per-session queues if throughput requires it.
  const [writes] = useState(() => ({ tail: Promise.resolve(), revisions: new Map<string, number>(), accepted: new Map<string, boolean>(), desired: new Map<string, boolean>(), bulk: false }));
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    setSessions(initialSessions);
    setActiveSession((current:any) => current ? initialSessions.find((session:any) => session.id === current.id) ?? current : null);
  }, [initialSessions]);

  const activeMarks = useMemo(() => new Map((activeSession?.attendance_marks || []).map((mark:any) => [mark.participant_id, Boolean(mark.present)])), [activeSession]);
  const presentCount = activeSession ? participants.filter((p) => activeMarks.get(p.id)).length : 0;
  const visibleParticipants = useMemo(() => participants.filter((person) => `${person.full_name} ${person.unit_name || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [participants,query]);
  const visibleSessions = sessions.filter((session) => typeFilter === 'all' || session.session_type === typeFilter);

  async function createSession(formData:FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title){setFormError('Escribe un nombre para el pase de lista.');return;}
    setSaving(true);setFormError('');
    try{
      const occurred=String(formData.get('occurred_at') || '');
      const payload = { camporee_id:camporeeId, title, session_type:String(formData.get('session_type') || 'general'), occurred_at:occurred ? camporeeDateTimeIso(occurred,timeZone) : new Date().toISOString(), created_by:userId };
      const result = await supabase.from('attendance_sessions').insert(payload).select('id,title,session_type,occurred_at,created_at').single(); const { data, status } = result; const error = mutationProblem(result);
      if(error||!data){const message=reportMutationError(error,'No se pudo crear el pase de lista.');setFormError(message);return;}
      const hydrated={...data,attendance_marks:[]}; setSessions((current)=>[hydrated,...current]); setActiveSession(hydrated); setOpen(false); reportMutationSuccess(mutationNotice(status, 'Pase de lista creado.')); if(status!==202)router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo crear el pase de lista.');setFormError(message)}finally{setSaving(false)}
  }

  const updatePersonMark = (marks:any[], participantId:string, mark:any) => [...marks.filter((m:any)=>m.participant_id!==participantId),mark];

  function applyMark(sessionId:string, participantId:string, mark:any) {
    setActiveSession((current:any)=>current&&current.id===sessionId?{...current,attendance_marks:updatePersonMark(current.attendance_marks||[],participantId,mark)}:current);
    setSessions((current)=>current.map((session)=>session.id===sessionId?{...session,attendance_marks:updatePersonMark(session.attendance_marks||[],participantId,mark)}:session));
  }

  async function toggleParticipant(person:any) {
    if (!canEdit || !activeSession || writes.bulk) return;
    const sessionId=activeSession.id, key=`${sessionId}:${person.id}`;
    const previous=writes.desired.get(key) ?? Boolean(activeMarks.get(person.id));
    if(!writes.accepted.has(key))writes.accepted.set(key,Boolean(activeMarks.get(person.id)));
    const next=!previous, revision=(writes.revisions.get(key)||0)+1;
    writes.revisions.set(key,revision);writes.desired.set(key,next);
    applyMark(sessionId,person.id,{participant_id:person.id,present:next});
    const operation=writes.tail.catch(()=>{}).then(async()=>{
      try {
        const result=await supabase.from('attendance_marks').upsert({session_id:sessionId,participant_id:person.id,present:next},{onConflict:'session_id,participant_id'}).select('id,participant_id,present').single();
        const error=mutationProblem(result,[person.id],'participant_id');
        if(!error&&result.data?.present!==next)throw new Error('La respuesta no coincide con la asistencia solicitada.');
        if(error)throw error;
        writes.accepted.set(key,next);
        if(writes.revisions.get(key)===revision){applyMark(sessionId,person.id,{...result.data,pending:result.status===202});writes.desired.delete(key);writes.accepted.delete(key);}
        if(result.status===202)reportMutationSuccess(mutationNotice(result.status,''));
      } catch(error) {
        if(writes.revisions.get(key)===revision){const rollback=writes.accepted.get(key)||false;writes.desired.set(key,rollback);applyMark(sessionId,person.id,{participant_id:person.id,present:rollback});writes.desired.delete(key);writes.accepted.delete(key);}
        reportMutationError(error,'No se pudo guardar la asistencia.');
      }
    });
    writes.tail=operation;await operation;
  }

  async function markAllPresent() {
    if (!canEdit || !activeSession || writes.bulk || !participants.length) return;
    const sessionId=activeSession.id;
    writes.bulk=true;setBulkSaving(true);
    const revisions=new Map<string,number>();
    for(const person of participants){
      const key=`${sessionId}:${person.id}`,revision=(writes.revisions.get(key)||0)+1;
      if(!writes.accepted.has(key))writes.accepted.set(key,Boolean(activeMarks.get(person.id)));
      revisions.set(key,revision);writes.revisions.set(key,revision);writes.desired.set(key,true);
      applyMark(sessionId,person.id,{participant_id:person.id,present:true});
    }
    const operation=writes.tail.catch(()=>{}).then(async()=>{
      try {
        const payload=participants.map((person)=>({session_id:sessionId,participant_id:person.id,present:true}));
        const result=await supabase.from('attendance_marks').upsert(payload,{onConflict:'session_id,participant_id'}).select('id,participant_id,present');
        const error=mutationProblem(result,participants.map(person=>person.id),'participant_id');
        if(error)throw error;
        if(result.data?.length!==participants.length || participants.some(person=>!result.data.some((mark:any)=>mark.participant_id===person.id&&mark.present)))throw new Error('No se confirmó la asistencia de todos los participantes.');
        for(const person of participants){const key=`${sessionId}:${person.id}`;applyMark(sessionId,person.id,{...result.data.find((mark:any)=>mark.participant_id===person.id),pending:result.status===202});writes.desired.delete(key);writes.accepted.delete(key);}
        reportMutationSuccess(mutationNotice(result.status,'Asistencia actualizada.'));
        if(result.status!==202)router.refresh();
      } catch(error) {
        for(const person of participants){const key=`${sessionId}:${person.id}`;if(writes.revisions.get(key)===revisions.get(key)){const rollback=writes.accepted.get(key)||false;writes.desired.set(key,rollback);applyMark(sessionId,person.id,{participant_id:person.id,present:rollback});writes.desired.delete(key);writes.accepted.delete(key);}}
        reportMutationError(error,'No se pudo marcar a todos como presentes.');
      } finally {writes.bulk=false;setBulkSaving(false);}
    });
    writes.tail=operation;await operation;
  }

  return <>
    <BottomSheet open={Boolean(activeSession)} onClose={()=>{setActiveSession(null);setQuery('')}} title={activeSession?.title || ''} description={`${presentCount} presentes de ${participants.length}`} busy={bulkSaving}>{activeSession ? <>
    <div className='attendance-live-head ios-card'><div><small>{typeLabel(activeSession.session_type)}</small><h2>{activeSession.title}</h2><span>{presentCount}/{participants.length} presentes</span></div><button type='button' className='secondary-btn' onClick={()=>{setActiveSession(null);setQuery('')}}>Terminar</button></div>
    <div className='panel-tools attendance-live-tools'><label className='panel-search'><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder='Buscar participante o unidad'/>{query?<button type='button' onClick={()=>setQuery('')} aria-label='Limpiar'><X size={16}/></button>:null}</label>{canEdit&&presentCount<participants.length?<button className='secondary-btn attendance-mark-all' type='button' onClick={markAllPresent} disabled={bulkSaving}><CheckCheck size={17}/>{bulkSaving?'Marcando…':'Todos presentes'}</button>:null}</div>
    <section className='panel-list attendance-live-list'>{visibleParticipants.length?visibleParticipants.map((person)=>{const present=Boolean(activeMarks.get(person.id));const pending=(activeSession.attendance_marks||[]).some((mark:any)=>mark.participant_id===person.id&&mark.pending);return <button type='button' className={`panel-row ios-card attendance-person ${present?'is-present':''}`} onClick={()=>toggleParticipant(person)} key={person.id} disabled={!canEdit||bulkSaving}><span className='attendance-check'>{present?<Check size={18}/>:null}</span><div className='panel-row-copy'><strong>{person.full_name}</strong><small>{person.unit_name||'Sin unidad'}</small></div><span className={`status-pill ${present?'confirmed':'pending'}`}>{present?'Presente':'Falta'}{pending?' · pendiente':''}</span></button>}):<div className='empty compact'>No hay participantes que coincidan con la búsqueda.</div>}</section>
  </> : null}</BottomSheet>
    <div className='filter-chips polymet-detail-filters'>{[['all','Todos'],['departure','Salida'],['arrival','Llegada'],['worship','Culto'],['activity','Actividad']].map(([value,label])=><button type='button' key={value} className={typeFilter===value?'active':''} onClick={()=>setTypeFilter(value)}>{label}</button>)}</div>
    <div className='panel-tools'>{canEdit?<button type='button' className='panel-add' onClick={()=>{setFormError('');setOpen(true)}}><Plus size={18}/> Nuevo pase de lista</button>:null}</div>
    <BottomSheet open={Boolean(open)} onClose={()=>{if(!saving)setOpen(false)}} title={<>Nuevo pase de lista</>} busy={saving}><form onSubmit={(event)=>{event.preventDefault();void createSession(new FormData(event.currentTarget));}} className="panel-form pm-sheet-form"><div className="pm-sheet-fields">{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<label className="pm-field"><span>Nombre <b className="pm-required">*</b></span><input name='title'  required/></label><label className="pm-field"><span>Tipo</span><select name='session_type' defaultValue='general'><option value='general'>General</option><option value='departure'>Salida</option><option value='arrival'>Llegada</option><option value='activity'>Actividad</option><option value='worship'>Culto</option><option value='night'>Noche</option><option value='return'>Regreso</option></select></label><label className="pm-field"><span>Fecha y hora</span><input name='occurred_at' type='datetime-local'/></label></div><div className="pm-sheet-footer"><button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div></form></BottomSheet>
    <section className='panel-list'>{visibleSessions.length?visibleSessions.map((session)=>{const count=(session.attendance_marks||[]).filter((m:any)=>m.present).length;return <button type='button' className='panel-row ios-card attendance-session-row' onClick={()=>setActiveSession(session)} key={session.id}><span className='stat-icon stat-blue'><ClipboardCheck size={20}/></span><div className='panel-row-copy'><strong>{session.title}</strong><small>{typeLabel(session.session_type)} · {new Date(session.occurred_at).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short',timeZone})}</small><span className='polymet-attendance-progress'><i style={{width:`${participants.length?Math.min(100,count/participants.length*100):0}%`}}/></span></div><span className='polymet-attendance-count'><strong>{count}</strong><small>de {participants.length}</small></span></button>}):<div className='empty compact polymet-empty'><span className='polymet-empty-icon'><ClipboardCheck size={24}/></span><strong>Sin pases de lista</strong><small>{typeFilter==='all'?'Crea un control para salidas, llegadas, cultos o actividades.':'No hay pases de lista de este tipo.'}</small></div>}</section>
  </>;
}
