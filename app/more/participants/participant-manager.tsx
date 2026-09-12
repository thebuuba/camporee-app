'use client';

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Phone, Plus, Search, ShieldAlert, Trash2, UserRound, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval, reportMutationError, reportMutationSuccess } from "@/lib/client-ui";

const attendanceLabel = (value:string) => value === "confirmed" ? "Confirmado" : value === "invited" ? "Pendiente" : value === "checked_in" ? "Presente" : "No asistirá";

export default function ParticipantManager({ camporeeId, canEdit, initialParticipants }: { camporeeId: string; canEdit: boolean; initialParticipants: any[] }) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<'people'|'units'>('people');
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

  const personCard = (person:any) => <article className="panel-row ios-card" key={person.id}>
    {rollCall ? <button type="button" className={`roll-call-check ${person.attendance_status === 'checked_in' ? 'present' : ''}`} onClick={() => setPresence(person)} disabled={!canEdit} aria-label={person.attendance_status === 'checked_in' ? 'Marcar ausente' : 'Marcar presente'}>{person.attendance_status === 'checked_in' ? <Check size={20}/> : <UserRound size={18}/>}</button> : <span className="stat-icon stat-blue"><UserRound size={18}/></span>}
    <div className="panel-row-copy"><strong>{person.full_name}</strong><small>{person.participant_type === "leader" ? "Dirigente" : person.participant_type === "staff" ? "Personal" : person.participant_type === "guest" ? "Invitado" : "Miembro"}{person.unit_name ? ` · ${person.unit_name}` : ""}</small><span className={`status-pill ${person.attendance_status}`}>{attendanceLabel(person.attendance_status)}</span>{!rollCall && person.phone ? <small><Phone size={12}/> {person.phone}</small> : null}{!rollCall && person.emergency_contact ? <small><ShieldAlert size={12}/> {person.emergency_contact}{person.emergency_phone ? ` · ${person.emergency_phone}` : ""}</small> : null}</div>
    {!rollCall && canEdit ? <div className="row-actions"><button type="button" className="row-icon-btn" onClick={() => openEdit(person)} aria-label="Editar"><Pencil size={16}/></button><button type="button" className="row-icon-btn danger" onClick={() => removeParticipant(person.id)} aria-label="Eliminar"><Trash2 size={17}/></button></div> : null}
  </article>;

  return <>
    <div className="participant-mode-row">
      <div className="program-scope-switch"><button type="button" className={view==='people'?'active':''} onClick={()=>setView('people')}>Personas</button><button type="button" className={view==='units'?'active':''} onClick={()=>setView('units')}>Unidades</button></div>
      {canEdit ? <button type="button" className={`roll-call-toggle ${rollCall?'active':''}`} onClick={()=>setRollCall((value)=>!value)}><UsersRound size={17}/>{rollCall ? 'Cerrar pase' : 'Pasar lista'}</button> : null}
    </div>
    {rollCall ? <div className="roll-call-summary"><strong>{presentCount}/{participants.length} presentes</strong><small>Toca cada persona para marcar o desmarcar su presencia.</small></div> : null}
    <div className="panel-tools">
      <label className="panel-search"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar participante o unidad"/>{query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpiar"><X size={16}/></button> : null}</label>
      <div className="filter-chips">{[["all","Todos"],["confirmed","Confirmados"],["invited","Pendientes"],["checked_in","Presentes"]].map(([value,label]) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
      {!rollCall && canEdit ? <button type="button" className="panel-add" onClick={openNew}><Plus size={18}/> Agregar participante</button> : null}
    </div>

    {open ? <div className="sheet-backdrop" onClick={closeSheet}><section className="sheet-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>{editing ? "Editar participante" : "Nuevo participante"}</h2><form onSubmit={(event)=>{event.preventDefault();void saveParticipant(new FormData(event.currentTarget));}} className="panel-form">{formError?<div className="auth-alert error" role="alert">{formError}</div>:null}<input name="full_name" placeholder="Nombre completo" defaultValue={editing?.full_name || ""} required/><div className="form-two"><select name="participant_type" defaultValue={editing?.participant_type || "member"}><option value="member">Miembro</option><option value="leader">Dirigente</option><option value="staff">Personal</option><option value="guest">Invitado</option></select><select name="attendance_status" defaultValue={editing?.attendance_status || "confirmed"}><option value="invited">Pendiente</option><option value="confirmed">Confirmado</option><option value="checked_in">Presente</option><option value="cancelled">No asistirá</option></select></div><input name="unit_name" placeholder="Unidad o equipo" defaultValue={editing?.unit_name || ""}/><input name="phone" inputMode="tel" placeholder="Teléfono" defaultValue={editing?.phone || ""}/><div className="form-two"><input name="emergency_contact" placeholder="Contacto de emergencia" defaultValue={editing?.emergency_contact || ""}/><input name="emergency_phone" inputMode="tel" placeholder="Teléfono emergencia" defaultValue={editing?.emergency_phone || ""}/></div><textarea name="notes" placeholder="Notas" defaultValue={editing?.notes || ""}/><button type="submit" className="primary-btn" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar participante"}</button></form></section></div> : null}

    {view === 'units' ? <section className="unit-groups">{unitGroups.length ? unitGroups.map(([unit,rows]) => <section className="unit-group" key={unit}><div className="program-day-head"><strong>{unit}</strong><span>{rows.filter((person)=>person.attendance_status==='checked_in').length}/{rows.length} presentes</span></div><div className="panel-list">{rows.map(personCard)}</div></section>) : <div className="empty compact">No hay participantes que coincidan con este filtro.</div>}</section> : <section className="panel-list">{visible.length ? visible.map(personCard) : <div className="empty compact">No hay participantes que coincidan con este filtro.</div>}</section>}
  </>;
}
