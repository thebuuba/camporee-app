'use client';

import { useState } from "react";
import { Plus, StickyNote, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function NotesManager({ camporeeId, userId, canEdit, initialNotes, areas }: { camporeeId:string; userId:string; canEdit:boolean; initialNotes:any[]; areas:any[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function addNote(formData:FormData) {
    if (!canEdit || saving) return;
    const body = String(formData.get('body') || '').trim();
    if (!body) return;
    setSaving(true);
    const payload = {
      camporee_id:camporeeId,
      created_by:userId,
      title:String(formData.get('title') || '').trim() || null,
      body,
      note_date:String(formData.get('note_date') || new Date().toISOString().slice(0,10)),
      area_id:String(formData.get('area_id') || '') || null,
    };
    const { data, error } = await supabase.from('notes').insert(payload).select('id,title,body,note_date,area_id,created_at').single();
    setSaving(false);
    if (!error && data) { setNotes((cur) => [data, ...cur]); setOpen(false); }
  }

  async function removeNote(id:string) {
    if (!canEdit) return;
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (!error) setNotes((cur) => cur.filter((note) => note.id !== id));
  }

  return <>{canEdit ? <button className="panel-add" onClick={() => setOpen(true)}><Plus size={18}/> Nuevo apunte</button> : null}{open ? <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="sheet-card" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>Nuevo apunte</h2><form action={addNote} className="panel-form"><input name="title" placeholder="Título opcional"/><textarea name="body" placeholder="Escribe el apunte…" required/><div className="form-two"><input name="note_date" type="date" defaultValue={new Date().toISOString().slice(0,10)}/><select name="area_id" defaultValue=""><option value="">Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></div><button className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar apunte'}</button></form></section></div> : null}<section className="panel-list">{notes.length ? notes.map((note) => <article className="panel-row ios-card" key={note.id}><span className="stat-icon stat-blue"><StickyNote size={18}/></span><div className="panel-row-copy"><strong>{note.title || 'Apunte'}</strong><small>{new Date(`${note.note_date}T00:00:00`).toLocaleDateString('es-DO',{dateStyle:'medium'})}</small><div style={{fontSize:13,lineHeight:1.45,color:'var(--muted)',whiteSpace:'pre-wrap'}}>{note.body}</div></div>{canEdit ? <button className="row-icon-btn danger" onClick={() => removeNote(note.id)} aria-label="Eliminar"><Trash2 size={17}/></button> : null}</article>) : <div className="empty compact">Todavía no hay apuntes.</div>}</section></>;
}
