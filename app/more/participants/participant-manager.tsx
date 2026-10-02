'use client';

import BottomSheet from '@/app/components/bottom-sheet';

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval, reportMutationError, reportMutationSuccess } from "@/lib/client-ui";

const attendanceLabel = (value:string) => value === "confirmed" ? "Confirmado" : value === "invited" ? "Pendiente" : value === "checked_in" ? "Presente" : "No asistirá";

export default function ParticipantManager({ camporeeId, canEdit, initialParticipants }: { camporeeId: string; canEdit: boolean; initialParticipants: any[] }) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<'people'|'units'>('units');
  const [rollCall, setRollCall] = useState(false);
  const supabase = createClient();

  useEffect(() => { setParticipants(initialParticipants); }, [initialParticipants]);

  const visible = useMemo(() => participants.filter((person) => {
    const matchesText = `${person.full_name} ${person.unit_name || ""} ${person.phone || ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || person.attendance_status === filter;
    return matchesText && matchesFilter;
  }), [participants, query, filter]);

  const unitGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    visible.forEach((person) => {
      const key = person.unit_name?.trim() || 'Sin unidad';
      groups.set(key, [...(groups.get(key) || []), person]);
    });
    return [...groups.entries()].sort(([a],[b]) => a.localeCompare(b));
  }, [visible]);

  const presentCount = participants.filter((person) => person.attendance_status === 'checked_in').length;
  const initials = (name:string) => name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();

  function openNew() { setEditing(null); setFormError(''); setOpen(true); }
  function openEdit(person: any) { setEditing(person); setFormError(''); setOpen(true); }
  function closeSheet(){if(saving)return;setOpen(false);setEditing(null);setFormError('')}

  async function saveParticipant(formData: FormData) {
    if (!canEdit || saving) return;
    const fullName = String(formData.get("full_name") || "").trim();
    if (!fullName){setFormError('Escribe el nombre del participante.');return;}
    setSaving(true);setFormError('');
    try{
      const payload = {
        camporee_id: camporeeId,
        full_name: fullName,
        participant_type: String(formData.get("participant_type") || "member"),
        unit_name: String(formData.get("unit_name") || "").trim() || null,
        phone: String(formData.get("phone") || "").trim() || null,
        emergency_contact: String(formData.get("emergency_contact") || "").trim() || null,
        emergency_phone: String(formData.get("emergency_phone") || "").trim() || null,
        attendance_status: String(formData.get("attendance_status") || "confirmed"),
        notes: String(formData.get("notes") || "").trim() || null,
      };
      const fields = "id,full_name,participant_type,unit_name,phone,emergency_contact,emergency_phone,attendance_status,notes";
      const request = editing ? supabase.from("participants").update(payload).eq("id", editing.id) : supabase.from("participants").insert(payload);
      const { data, error } = await request.select(fields).single();
      if(error||!data){const message=reportMutationError(error,'No se pudo guardar el participante.');setFormError(message);return;}
      setParticipants((current) => (editing ? current.map((item) => item.id === data.id ? data : item) : [...current, data]).sort((a,b) => a.full_name.localeCompare(b.full_name)));
      reportMutationSuccess(editing?'Participante actualizado.':'Participante agregado.');setOpen(false);setEditing(null);
    }catch(error){const message=reportMutationError(error,'No se pudo guardar el participante.');setFormError(message)}finally{setSaving(false)}
  }

  async function setPresence(person:any) {
    if (!canEdit) return;
    const next = person.attendance_status === 'checked_in' ? 'confirmed' : 'checked_in';
    setParticipants((current) => current.map((item) => item.id === person.id ? {...item, attendance_status:next} : item));
    const { error } = await supabase.from('participants').update({ attendance_status: next }).eq('id', person.id);
    if (error){setParticipants((current) => current.map((item) => item.id === person.id ? {...item, attendance_status:person.attendance_status} : item));reportMutationError(error,'No se pudo actualizar la asistencia.');}
  }

  async function removeParticipant(id: string) {
    if (!canEdit || !confirmRemoval('este participante')) return;
    const { error } = await supabase.from("participants").delete().eq("id", id);
    if(error){reportMutationError(error,'No se pudo eliminar el participante.');return;}
    setParticipants((current) => current.filter((item) => item.id !== id));reportMutationSuccess('Participante eliminado.');
  }

  const personCard = (person:any) => <article className="pm-person-row" key={person.id}>
    <button type="button" className="pm-person-main" onClick={()=>rollCall?void setPresence(person):setSelected(person)} aria-label={`Ver ${person.full_name}`}>
      <span className="pm-initials">{initials(person.full_name)}</span><span className="pm-person-copy"><strong>{person.full_name}</strong><small>{person.participant_type === 'leader' ? 'Dirigente' : person.participant_type === 'staff' ? 'Personal' : person.participant_type === 'guest' ? 'Invitado' : 'Miembro'}{person.phone ? ` · ${person.phone}` : ''}</small></span><span className={`pm-status ${person.attendance_status}`}>{attendanceLabel(person.attendance_status)}</span>
    </button>
    {!rollCall&&canEdit?<button type="button" className="pm-person-delete" onClick={()=>removeParticipant(person.id)} aria-label={`Eliminar ${person.full_name}`}><Trash2 size={14}/></button>:null}
  </article>;

  return <>
    <BottomSheet open={Boolean(selected)} onClose={()=>setSelected(null)} title={selected?.full_name || ''} description={selected ? `Unidad ${selected.unit_name || 'Sin unidad'} · ${selected.participant_type === 'leader' ? 'Dirigente' : 'Conquistador'}` : ''} footer={selected && canEdit ? <button type="button" className="primary-btn" onClick={()=>{const person=selected;setSelected(null);openEdit(person)}}><Pencil size={16}/> Editar participante</button> : undefined}>
      {selected ? <div className="pm-sheet-detail"><span className={`pm-status ${selected.attendance_status}`}>{attendanceLabel(selected.attendance_status)}</span>{selected.phone ? <div className="pm-detail-item"><div><small>Teléfono</small><a href={`tel:${selected.phone}`}>{selected.phone}</a></div></div> : null}{selected.emergency_contact || selected.emergency_phone ? <div className="pm-detail-item"><div><small>Contacto de emergencia</small><strong>{selected.emergency_contact || 'Sin nombre'}</strong>{selected.emergency_phone ? <a href={`tel:${selected.emergency_phone}`}>{selected.emergency_phone}</a> : null}</div></div> : null}{selected.notes ? <div className="pm-detail-item"><div><small>Notas médicas</small><p>{selected.notes}</p></div></div> : null}</div> : null}
    </BottomSheet>
    <p className="pm-page-count">{presentCount} presentes · {participants.length} inscritos</p>
    <label className="pm-search"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar persona o unidad"/><span><Search size={18}/></span></label>
    <div className="pm-chips">{[['all','Todos'],['checked_in','Presentes'],['confirmed','Confirmados'],['invited','Pendientes'],['cancelled','No asisten']].map(([value,label])=><button type="button" key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    <div className="pm-participant-controls"><button type="button" onClick={()=>setView(view==='units'?'people':'units')}>{view==='units'?'Ver personas':'Ver unidades'}</button>{canEdit?<button type="button" onClick={()=>setRollCall(value=>!value)}><UsersRound size={15}/>{rollCall?'Cerrar pase':'Pasar lista'}</button>:null}</div>
    {rollCall?<div className="roll-call-summary"><strong>{presentCount}/{participants.length} presentes</strong><small>Toca cada persona para marcar su presencia.</small></div>:null}
    <BottomSheet open={Boolean(open)} onClose={closeSheet} title={<>{editing ? "Editar participante" : "Nuevo participante"}</>} busy={saving}><form onSubmit={(event)=>{event.preventDefault();void saveParticipant(new FormData(event.currentTarget));}} className="panel-form participant-edit-form pm-sheet-form"><div className="pm-sheet-fields">{formError?<div className="auth-alert error" role="alert">{formError}</div>:null}<label className="pm-field"><span>Nombre completo <b className="pm-required">*</b></span><input name="full_name"  defaultValue={editing?.full_name || ""} required/></label><div className="form-two"><label className="pm-field"><span>Cargo</span><select name="participant_type" defaultValue={editing?.participant_type || "member"}><option value="member">Miembro</option><option value="leader">Dirigente</option><option value="staff">Personal</option><option value="guest">Invitado</option></select></label><label className="pm-field"><span>Confirmación</span><select name="attendance_status" defaultValue={editing?.attendance_status || "confirmed"}><option value="invited">Pendiente</option><option value="confirmed">Confirmado</option><option value="checked_in">Presente</option><option value="cancelled">No asistirá</option></select></label></div><label className="pm-field"><span>Unidad</span><input name="unit_name"  defaultValue={editing?.unit_name || ""}/></label><label className="pm-field"><span>Teléfono</span><input name="phone" inputMode="tel"  defaultValue={editing?.phone || ""}/></label><div className="form-two"><label className="pm-field"><span>Contacto de emergencia</span><input name="emergency_contact"  defaultValue={editing?.emergency_contact || ""}/></label><label className="pm-field"><span>Teléfono de emergencia</span><input name="emergency_phone" inputMode="tel"  defaultValue={editing?.emergency_phone || ""}/></label></div><label className="pm-field"><span>Notas médicas</span><textarea name="notes"  defaultValue={editing?.notes || ""}/></label></div><div className="pm-sheet-footer"><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div></form></BottomSheet>
    {view==='units'?<section className="pm-unit-groups">{unitGroups.length?unitGroups.map(([unit,rows])=><section className="pm-unit-group" key={unit}><div className="pm-unit-head"><strong>UNIDAD {unit.toUpperCase()}</strong><span>{rows.length}</span></div><div className="pm-person-list">{rows.map(personCard)}</div></section>):<div className="empty compact">No hay participantes que coincidan con este filtro.</div>}</section>:<section className="pm-person-list">{visible.length?visible.map(personCard):<div className="empty compact">No hay participantes que coincidan con este filtro.</div>}</section>}
    {canEdit&&!rollCall?<button type="button" className="pm-fab" onClick={openNew}><Plus size={20}/> Participante</button>:null}
  </>;
}
