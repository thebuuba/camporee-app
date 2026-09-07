'use client';

import { useMemo, useState } from "react";
import { Pencil, Phone, Plus, Search, ShieldAlert, Trash2, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval } from "@/lib/client-ui";

const attendanceLabel = (value:string) => value === "confirmed" ? "Confirmado" : value === "invited" ? "Pendiente" : value === "checked_in" ? "Presente" : "No asistirá";

export default function ParticipantManager({ camporeeId, canEdit, initialParticipants }: { camporeeId: string; canEdit: boolean; initialParticipants: any[] }) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const supabase = createClient();

  const visible = useMemo(() => participants.filter((person) => {
    const matchesText = `${person.full_name} ${person.unit_name || ""} ${person.phone || ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || person.attendance_status === filter;
    return matchesText && matchesFilter;
  }), [participants, query, filter]);

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(person: any) { setEditing(person); setOpen(true); }

  async function saveParticipant(formData: FormData) {
    if (!canEdit || saving) return;
    const fullName = String(formData.get("full_name") || "").trim();
    if (!fullName) return;
    setSaving(true);
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
    setSaving(false);
    if (!error && data) {
      setParticipants((current) => (editing ? current.map((item) => item.id === data.id ? data : item) : [...current, data]).sort((a,b) => a.full_name.localeCompare(b.full_name)));
      setOpen(false); setEditing(null);
    }
  }

  async function removeParticipant(id: string) {
    if (!canEdit || !confirmRemoval('este participante')) return;
    const { error } = await supabase.from("participants").delete().eq("id", id);
    if (!error) setParticipants((current) => current.filter((item) => item.id !== id));
  }

  return <>
    <div className="panel-tools">
      <label className="panel-search"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar participante"/>{query ? <button onClick={() => setQuery("")} aria-label="Limpiar"><X size={16}/></button> : null}</label>
      <div className="filter-chips">{[["all","Todos"],["confirmed","Confirmados"],["invited","Pendientes"],["checked_in","Presentes"]].map(([value,label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
      {canEdit ? <button className="panel-add" onClick={openNew}><Plus size={18}/> Agregar participante</button> : null}
    </div>

    {open ? <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="sheet-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>{editing ? "Editar participante" : "Nuevo participante"}</h2><form action={saveParticipant} className="panel-form"><input name="full_name" placeholder="Nombre completo" defaultValue={editing?.full_name || ""} required/><div className="form-two"><select name="participant_type" defaultValue={editing?.participant_type || "member"}><option value="member">Miembro</option><option value="leader">Dirigente</option><option value="staff">Personal</option><option value="guest">Invitado</option></select><select name="attendance_status" defaultValue={editing?.attendance_status || "confirmed"}><option value="invited">Pendiente</option><option value="confirmed">Confirmado</option><option value="checked_in">Presente</option><option value="cancelled">No asistirá</option></select></div><input name="unit_name" placeholder="Unidad o equipo" defaultValue={editing?.unit_name || ""}/><input name="phone" inputMode="tel" placeholder="Teléfono" defaultValue={editing?.phone || ""}/><div className="form-two"><input name="emergency_contact" placeholder="Contacto de emergencia" defaultValue={editing?.emergency_contact || ""}/><input name="emergency_phone" inputMode="tel" placeholder="Teléfono emergencia" defaultValue={editing?.emergency_phone || ""}/></div><textarea name="notes" placeholder="Notas" defaultValue={editing?.notes || ""}/><button className="primary-btn" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar participante"}</button></form></section></div> : null}

    <section className="panel-list">{visible.length ? visible.map((person) => <article className="panel-row ios-card" key={person.id}><span className="stat-icon stat-blue"><UserRound size={18}/></span><div className="panel-row-copy"><strong>{person.full_name}</strong><small>{person.participant_type === "leader" ? "Dirigente" : person.participant_type === "staff" ? "Personal" : person.participant_type === "guest" ? "Invitado" : "Miembro"}{person.unit_name ? ` · ${person.unit_name}` : ""}</small><span className={`status-pill ${person.attendance_status}`}>{attendanceLabel(person.attendance_status)}</span>{person.phone ? <small><Phone size={12}/> {person.phone}</small> : null}{person.emergency_contact ? <small><ShieldAlert size={12}/> {person.emergency_contact}{person.emergency_phone ? ` · ${person.emergency_phone}` : ""}</small> : null}</div>{canEdit ? <div className="row-actions"><button className="row-icon-btn" onClick={() => openEdit(person)} aria-label="Editar"><Pencil size={16}/></button><button className="row-icon-btn danger" onClick={() => removeParticipant(person.id)} aria-label="Eliminar"><Trash2 size={17}/></button></div> : null}</article>) : <div className="empty compact">No hay participantes que coincidan con este filtro.</div>}</section>
  </>;
}
