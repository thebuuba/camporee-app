'use client';

import { useState } from "react";
import { Plus, Trash2, UserRound, Phone, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ParticipantManager({ camporeeId, canEdit, initialParticipants }: { camporeeId: string; canEdit: boolean; initialParticipants: any[] }) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function addParticipant(formData: FormData) {
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
    const { data, error } = await supabase.from("participants").insert(payload).select("id,full_name,participant_type,unit_name,phone,emergency_contact,emergency_phone,attendance_status,notes").single();
    setSaving(false);
    if (!error && data) { setParticipants((current) => [...current, data].sort((a,b) => a.full_name.localeCompare(b.full_name))); setOpen(false); }
  }

  async function removeParticipant(id: string) {
    if (!canEdit) return;
    const { error } = await supabase.from("participants").delete().eq("id", id);
    if (!error) setParticipants((current) => current.filter((item) => item.id !== id));
  }

  return <>
    {canEdit ? <button className="panel-add" onClick={() => setOpen(true)}><Plus size={18}/> Agregar participante</button> : null}
    {open ? <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="sheet-card" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>Nuevo participante</h2><form action={addParticipant} className="panel-form"><input name="full_name" placeholder="Nombre completo" required/><div className="form-two"><select name="participant_type" defaultValue="member"><option value="member">Miembro</option><option value="leader">Dirigente</option><option value="staff">Personal</option><option value="guest">Invitado</option></select><select name="attendance_status" defaultValue="confirmed"><option value="confirmed">Confirmado</option><option value="pending">Pendiente</option><option value="cancelled">No asistirá</option></select></div><input name="unit_name" placeholder="Unidad o equipo"/><input name="phone" inputMode="tel" placeholder="Teléfono"/><div className="form-two"><input name="emergency_contact" placeholder="Contacto de emergencia"/><input name="emergency_phone" inputMode="tel" placeholder="Teléfono emergencia"/></div><textarea name="notes" placeholder="Notas"/><button className="primary-btn" disabled={saving}>{saving ? "Guardando…" : "Agregar participante"}</button></form></section></div> : null}
    <section className="panel-list">{participants.length ? participants.map((person) => <article className="panel-row ios-card" key={person.id}><span className="stat-icon stat-blue"><UserRound size={18}/></span><div className="panel-row-copy"><strong>{person.full_name}</strong><small>{person.participant_type === "leader" ? "Dirigente" : person.participant_type === "staff" ? "Personal" : person.participant_type === "guest" ? "Invitado" : "Miembro"}{person.unit_name ? ` · ${person.unit_name}` : ""}</small>{person.phone ? <small><Phone size={12}/> {person.phone}</small> : null}{person.emergency_contact ? <small><ShieldAlert size={12}/> {person.emergency_contact}{person.emergency_phone ? ` · ${person.emergency_phone}` : ""}</small> : null}</div>{canEdit ? <button className="row-icon-btn danger" onClick={() => removeParticipant(person.id)} aria-label="Eliminar"><Trash2 size={17}/></button> : null}</article>) : <div className="empty compact">Todavía no hay participantes. Agrega la primera persona del camporee.</div>}</section>
  </>;
}
