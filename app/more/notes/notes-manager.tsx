'use client';

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { Plus, StickyNote, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval, reportMutationError, reportMutationSuccess } from "@/lib/client-ui";
import { dateKeyInTimeZone } from "@/lib/date";

export default function NotesManager({ camporeeId, userId, canEdit, initialNotes, areas }: { camporeeId:string; userId:string; canEdit:boolean; initialNotes:any[]; areas:any[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setNotes(initialNotes); }, [initialNotes]);

  async function addNote(formData:FormData) {
    if (!canEdit || saving) return;
    const body = String(formData.get('body') || '').trim();
    if (!body){setFormError('Escribe el contenido del apunte.');return;}
    setSaving(true);setFormError('');
    try{
      const payload = { camporee_id:camporeeId, created_by:userId, title:String(formData.get('title') || '').trim() || null, body, note_date:String(formData.get('note_date') || dateKeyInTimeZone()), area_id:String(formData.get('area_id') || '') || null };
      const { data, error } = await supabase.from('notes').insert(payload).select('id,title,body,note_date,area_id,created_at').single();
      if(error||!data){const message=reportMutationError(error,'No se pudo guardar el apunte.');setFormError(message);return;}
      setNotes((cur) => [data, ...cur]); setOpen(false); reportMutationSuccess('Apunte guardado.'); router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo guardar el apunte.');setFormError(message)}finally{setSaving(false)}
  }

  async function removeNote(id:string) {
    if (!canEdit || !confirmRemoval('este apunte')) return;
    const previous = notes;
    setNotes((cur) => cur.filter((note) => note.id !== id));
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error){setNotes(previous);reportMutationError(error,'No se pudo eliminar el apunte.');} else {reportMutationSuccess('Apunte eliminado.');router.refresh();}
  }

  return <>{canEdit ? <button type="button" className="panel-add" onClick={() => {setFormError('');setOpen(true)}}><Plus size={18}/> Nuevo apunte</button> : null}{open ? <div className="sheet-backdrop" onClick={() => {if(!saving)setOpen(false)}}><section className="sheet-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>Nuevo apunte</h2><form onSubmit={(event)=>{event.preventDefault();void addNote(new FormData(event.currentTarget));}} className="panel-form">{formError?<div className="auth-alert error" role="alert">{formError}</div>:null}<input name="title" placeholder="Título opcional"/><textarea name="body" placeholder="Escribe el apunte…" required/><div className="form-two"><input name="note_date" type="date" defaultValue={dateKeyInTimeZone()}/><select name="area_id" defaultValue=""><option value="">Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></div><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar apunte'}</button></form></section></div> : null}<section className="panel-list">{notes.length ? notes.map((note) => <article className="panel-row ios-card" key={note.id}><span className="stat-icon stat-blue"><StickyNote size={18}/></span><div className="panel-row-copy"><strong>{note.title || 'Apunte'}</strong><small>{new Date(`${note.note_date}T00:00:00`).toLocaleDateString('es-DO',{dateStyle:'medium'})}</small><div style={{fontSize:13,lineHeight:1.45,color:'var(--muted)',whiteSpace:'pre-wrap'}}>{note.body}</div></div>{canEdit ? <button type="button" className="row-icon-btn danger" onClick={() => removeNote(note.id)} aria-label="Eliminar"><Trash2 size={17}/></button> : null}</article>) : <div className="empty compact">Todavía no hay apuntes.</div>}</section></>;
}
