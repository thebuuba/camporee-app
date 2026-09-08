'use client';

import { useMemo, useState } from 'react';
import { Check, ClipboardCheck, Plus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const typeLabel = (value:string) => ({departure:'Salida',arrival:'Llegada',activity:'Actividad',worship:'Culto',night:'Noche',return:'Regreso',general:'General'} as Record<string,string>)[value] || 'General';

export default function AttendanceManager({ camporeeId, userId, canEdit, participants, initialSessions }: { camporeeId:string; userId:string; canEdit:boolean; participants:any[]; initialSessions:any[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSession, setActiveSession] = useState<any|null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const activeMarks = useMemo(() => new Map((activeSession?.attendance_marks || []).map((mark:any) => [mark.participant_id, Boolean(mark.present)])), [activeSession]);
  const presentCount = activeSession ? participants.filter((p) => activeMarks.get(p.id)).length : 0;

  async function createSession(formData:FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    setSaving(true);
    const payload = {
      camporee_id: camporeeId,
      title,
      session_type: String(formData.get('session_type') || 'general'),
      occurred_at: String(formData.get('occurred_at') || '') ? new Date(String(formData.get('occurred_at'))).toISOString() : new Date().toISOString(),
      created_by: userId,
    };
    const { data, error } = await supabase.from('attendance_sessions').insert(payload).select('id,title,session_type,occurred_at,created_at').single();
    setSaving(false);
    if (!error && data) {
      const hydrated = { ...data, attendance_marks: [] };
      setSessions((current) => [hydrated, ...current]);
      setActiveSession(hydrated);
      setOpen(false);
    }
  }

  async function toggleParticipant(person:any) {
    if (!canEdit || !activeSession) return;
    const next = !activeMarks.get(person.id);
    const { data, error } = await supabase.from('attendance_marks').upsert({ session_id:activeSession.id, participant_id:person.id, present:next }, { onConflict:'session_id,participant_id' }).select('participant_id,present').single();
    if (error || !data) return;
    const updateMarks = (marks:any[]) => {
      const rest = marks.filter((m:any) => m.participant_id !== person.id);
      return [...rest, data];
    };
    setActiveSession((current:any) => current ? { ...current, attendance_marks:updateMarks(current.attendance_marks || []) } : current);
    setSessions((current) => current.map((session) => session.id === activeSession.id ? { ...session, attendance_marks:updateMarks(session.attendance_marks || []) } : session));
  }

  if (activeSession) return <>
    <div className='attendance-live-head ios-card'><div><small>{typeLabel(activeSession.session_type)}</small><h2>{activeSession.title}</h2><span>{presentCount}/{participants.length} presentes</span></div><button className='secondary-btn' onClick={() => setActiveSession(null)}>Terminar</button></div>
    <section className='panel-list attendance-live-list'>{participants.map((person) => { const present = Boolean(activeMarks.get(person.id)); return <button type='button' className={`panel-row ios-card attendance-person ${present ? 'is-present' : ''}`} onClick={() => toggleParticipant(person)} key={person.id} disabled={!canEdit}><span className='attendance-check'>{present ? <Check size={18}/> : null}</span><div className='panel-row-copy'><strong>{person.full_name}</strong><small>{person.unit_name || 'Sin unidad'}</small></div><span className={`status-pill ${present ? 'confirmed' : 'pending'}`}>{present ? 'Presente' : 'Falta'}</span></button>})}</section>
  </>;

  return <>
    <div className='panel-tools'>{canEdit ? <button className='panel-add' onClick={() => setOpen(true)}><Plus size={18}/> Nuevo pase de lista</button> : null}</div>
    {open ? <div className='sheet-backdrop' onClick={() => setOpen(false)}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Nuevo pase de lista</h2><form action={createSession} className='panel-form'><input name='title' placeholder='Ej. Salida hacia el culto' required/><select name='session_type' defaultValue='general'><option value='general'>General</option><option value='departure'>Salida</option><option value='arrival'>Llegada</option><option value='activity'>Actividad</option><option value='worship'>Culto</option><option value='night'>Noche</option><option value='return'>Regreso</option></select><input name='occurred_at' type='datetime-local'/><button className='primary-btn' disabled={saving}>{saving ? 'Creando…' : 'Comenzar pase'}</button></form></section></div> : null}
    <section className='panel-list'>{sessions.length ? sessions.map((session) => { const count = (session.attendance_marks || []).filter((m:any) => m.present).length; return <button type='button' className='panel-row ios-card attendance-session-row' onClick={() => setActiveSession(session)} key={session.id}><span className='stat-icon stat-blue'><ClipboardCheck size={18}/></span><div className='panel-row-copy'><strong>{session.title}</strong><small>{typeLabel(session.session_type)} · {new Date(session.occurred_at).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short'})}</small><small><Users size={12}/>{count}/{participants.length} presentes</small></div><span className='chevron'>›</span></button>}) : <div className='empty compact'>Todavía no hay pases de lista. Crea uno al salir, llegar o antes de una actividad.</div>}</section>
  </>;
}
