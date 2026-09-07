'use client';

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Utensils, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const mealTypes = [
  ["breakfast","Desayuno"],["snack_am","Merienda AM"],["lunch","Almuerzo"],["snack_pm","Merienda PM"],["dinner","Cena"],["other","Otro"],
] as const;
const mealLabel = (value:string) => mealTypes.find(([key]) => key === value)?.[1] ?? value;

export default function MealManager({ camporeeId, canEdit, initialMeals }: { camporeeId: string; canEdit: boolean; initialMeals: any[] }) {
  const [meals, setMeals] = useState(initialMeals);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const supabase = createClient();

  const visible = useMemo(() => meals.filter((meal) => {
    const matchesText = `${mealLabel(meal.meal_type)} ${meal.menu} ${meal.responsible_name || ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (filter === "all" || meal.meal_type === filter);
  }), [meals, query, filter]);

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(meal: any) { setEditing(meal); setOpen(true); }

  async function saveMeal(formData: FormData) {
    if (!canEdit || saving) return;
    const menu = String(formData.get("menu") || "").trim();
    const mealDate = String(formData.get("meal_date") || "");
    if (!menu || !mealDate) return;
    setSaving(true);
    const payload = { camporee_id: camporeeId, meal_date: mealDate, meal_type: String(formData.get("meal_type") || "breakfast"), menu, responsible_name: String(formData.get("responsible_name") || "").trim() || null, notes: String(formData.get("notes") || "").trim() || null };
    const request = editing ? supabase.from("meals").update(payload).eq("id", editing.id) : supabase.from("meals").insert(payload);
    const { data, error } = await request.select("id,meal_date,meal_type,menu,responsible_name,notes").single();
    setSaving(false);
    if (!error && data) {
      setMeals((current) => (editing ? current.map((item) => item.id === data.id ? data : item) : [...current, data]).sort((a,b) => `${a.meal_date}${a.meal_type}`.localeCompare(`${b.meal_date}${b.meal_type}`)));
      setOpen(false); setEditing(null);
    }
  }

  async function removeMeal(id: string) {
    if (!canEdit) return;
    const { error } = await supabase.from("meals").delete().eq("id", id);
    if (!error) setMeals((current) => current.filter((item) => item.id !== id));
  }

  return <>
    <div className="panel-tools"><label className="panel-search"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar comida o responsable"/>{query ? <button onClick={() => setQuery("")} aria-label="Limpiar"><X size={16}/></button> : null}</label><div className="filter-chips"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas</button>{mealTypes.map(([value,label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>{canEdit ? <button className="panel-add" onClick={openNew}><Plus size={18}/> Agregar comida</button> : null}</div>
    {open ? <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="sheet-card" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>{editing ? "Editar comida" : "Nueva comida"}</h2><form action={saveMeal} className="panel-form"><div className="form-two"><input name="meal_date" type="date" defaultValue={editing?.meal_date || ""} required/><select name="meal_type" defaultValue={editing?.meal_type || "breakfast"}>{mealTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><textarea name="menu" placeholder="Menú" defaultValue={editing?.menu || ""} required/><input name="responsible_name" placeholder="Responsable" defaultValue={editing?.responsible_name || ""}/><textarea name="notes" placeholder="Notas" defaultValue={editing?.notes || ""}/><button className="primary-btn" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar comida"}</button></form></section></div> : null}
    <section className="panel-list">{visible.length ? visible.map((meal) => <article className="panel-row ios-card" key={meal.id}><span className="stat-icon stat-gold"><Utensils size={18}/></span><div className="panel-row-copy"><strong>{mealLabel(meal.meal_type)}</strong><small>{new Date(`${meal.meal_date}T00:00:00`).toLocaleDateString("es-DO", { dateStyle: "medium" })}</small><b>{meal.menu}</b>{meal.responsible_name ? <small>Responsable: {meal.responsible_name}</small> : null}</div>{canEdit ? <div className="row-actions"><button className="row-icon-btn" onClick={() => openEdit(meal)} aria-label="Editar"><Pencil size={16}/></button><button className="row-icon-btn danger" onClick={() => removeMeal(meal.id)} aria-label="Eliminar"><Trash2 size={17}/></button></div> : null}</article>) : <div className="empty compact">No hay comidas que coincidan con este filtro.</div>}</section>
  </>;
}
