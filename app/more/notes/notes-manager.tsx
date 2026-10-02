'use client';

import BottomSheet from '@/app/components/bottom-sheet';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval, reportMutationError, reportMutationSuccess } from "@/lib/client-ui";
import { dateKeyInTimeZone } from "@/lib/date";

export default function NotesManager({ camporeeId, userId, canEdit, initialNotes, areas }: { camporeeId:string; userId:string; canEdit:boolean; initialNotes:any[]; areas:any[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const [query,setQuery] = useState('');
  const [areaFilter,setAreaFilter] = useState('all');
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

  const visible = useMemo(() => notes.filter((note) => (areaFilter === 'all' || note.area_id === areaFilter) && `${note.title || ''} ${note.body}`.toLowerCase().includes(query.toLowerCase())), [notes, areaFilter, query]);

  return <>
    <label className='polymet-search'><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder='Buscar en apuntes' aria-label='Buscar en apuntes'/>{query ? <button type='button' onClick={() => setQuery('')} aria-label='Limpiar búsqueda'><X size={18}/></button> : <span><Search size={20}/></span>}</label>
    <div className='polymet-filter-scroll'><button type='button' className={areaFilter === 'all' ? 'active' : ''} onClick={() => setAreaFilter('all')}>Todos</button>{areas.map((area) => <button type='button' key={area.id} className={areaFilter === area.id ? 'active' : ''} onClick={() => setAreaFilter(area.id)}>{area.name}</button>)}</div>
    {canEdit ? <button type='button' className='panel-add' onClick={() => {setFormError('');setOpen(true)}}><Plus size={18}/> Apunte</button> : null}
    <BottomSheet open={Boolean(open)} onClose={() => {if(!saving)setOpen(false)}} title={<>Nuevo apunte</>} busy={saving}><form onSubmit={(event)=>{event.preventDefault();void addNote(new FormData(event.currentTarget));}} className="panel-form pm-sheet-form"><div className="pm-sheet-fields">{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<label className="pm-field"><span>Título</span><input name='title' /></label><label className="pm-field"><span>Observación <b className="pm-required">*</b></span><textarea name='body'  required/></label><div className='form-two'><label className="pm-field"><span>Fecha</span><input name='note_date' type='date' defaultValue={dateKeyInTimeZone()}/></label><label className="pm-field"><span>Área</span><select name='area_id' defaultValue=''><option value=''>Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label></div></div><div className="pm-sheet-footer"><button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div></form></BottomSheet>
    <section className='polymet-note-list'>{visible.length ? visible.map((note,index) => <article className={`polymet-note ${index % 2 ? 'peach' : 'cream'}`} key={note.id}><div className='polymet-note-meta'><span>{new Date(note.created_at).toLocaleDateString('es-DO',{day:'numeric',month:'short'})} · {new Date(note.created_at).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})}</span>{note.area_id ? <span className='polymet-note-tag'>{areas.find((area) => area.id === note.area_id)?.name || 'Área'}</span> : null}</div><strong>{note.title || 'Apunte'}</strong><p>{note.body}</p>{canEdit ? <button type='button' onClick={() => removeNote(note.id)} aria-label='Eliminar apunte'><Trash2 size={15}/></button> : null}</article>) : <div className='empty compact'>No hay apuntes que coincidan con este filtro.</div>}</section>
  </>;
}
