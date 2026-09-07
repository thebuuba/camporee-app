'use client';

import { useState } from "react";
import { Plus, Trash2, Utensils } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function MealManager({ camporeeId, canEdit, initialMeals }: { camporeeId: string; canEdit: boolean; initialMeals: any[] }) {
  const [meals, setMeals] = useState(initialMeals);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function addMeal(formData: FormData) {
    if (!canEdit || saving) return;
    const menu = String(formData.get("menu") || "").trim();
    const mealDate = String(formData.get("meal_date") || "");
    if (!menu || !mealDate) return;
    setSaving(true);
    const payload = { camporee_id: camporeeId, meal_date: mealDate, meal_type: String(formData.get("meal_type") || "Desayuno"), menu, responsible_name: String(formData.get("responsible_name") || "").trim() || null, notes: String(formData.get("notes") || "").trim() || null };
    const { data, error } = await supabase.from("meals").insert(payload).select("id,meal_date,meal_type,menu,responsible_name,notes").single();
    setSaving(false);
    if (!error && data) { setMeals((current) => [...current, data].sort((a,b) => `${a.meal_date}${a.meal_type}`.localeCompare(`${b.meal_date}${b.meal_type}`))); setOpen(false); }
  }

  async function removeMeal(id: string) {
    if (!canEdit) return;
    const { error } = await supabase.from("meals").delete().eq("id", id);
    if (!error) setMeals((current) => current.filter((item) => item.id !== id));
  }

  return <>{canEdit ? <button className="panel-add" onClick={() => setOpen(true)}><Plus size={18}/> Agregar comida</button> : null}{open ? <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="sheet-card" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>Nueva comida</h2><form action={addMeal} className="panel-form"><div className="form-two"><input name="meal_date" type="date" required/><select name="meal_type" defaultValue="Desayuno"><option>Desayuno</option><option>Almuerzo</option><option>Cena</option><option>Merienda</option></select></div><textarea name="menu" placeholder="Menú" required/><input name="responsible_name" placeholder="Responsable"/><textarea name="notes" placeholder="Notas"/><button className="primary-btn" disabled={saving}>{saving ? "Guardando…" : "Guardar comida"}</button></form></section></div> : null}<section className="panel-list">{meals.length ? meals.map((meal) => <article className="panel-row ios-card" key={meal.id}><span className="stat-icon stat-gold"><Utensils size={18}/></span><div className="panel-row-copy"><strong>{meal.meal_type}</strong><small>{new Date(`${meal.meal_date}T00:00:00`).toLocaleDateString("es-DO", { dateStyle: "medium" })}</small><b>{meal.menu}</b>{meal.responsible_name ? <small>Responsable: {meal.responsible_name}</small> : null}</div>{canEdit ? <button className="row-icon-btn danger" onClick={() => removeMeal(meal.id)} aria-label="Eliminar"><Trash2 size={17}/></button> : null}</article>) : <div className="empty compact">Todavía no hay comidas planificadas.</div>}</section></>;
}
