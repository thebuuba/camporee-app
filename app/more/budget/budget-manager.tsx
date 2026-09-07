'use client';

import { useMemo, useState } from "react";
import { DollarSign, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function BudgetManager({ camporeeId, userId, canEdit, initialExpenses, areas }: { camporeeId: string; userId: string; canEdit: boolean; initialExpenses: any[]; areas: any[] }) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const supabase = createClient();
  const total = useMemo(() => expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0), [expenses]);
  const categories = useMemo(() => Array.from(new Set(expenses.map((item) => item.category).filter(Boolean))), [expenses]);
  const visible = useMemo(() => expenses.filter((expense) => {
    const matchesText = `${expense.description} ${expense.category || ""} ${expense.paid_by || ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (category === "all" || expense.category === category);
  }), [expenses, query, category]);

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(expense:any) { setEditing(expense); setOpen(true); }

  async function saveExpense(formData: FormData) {
    if (!canEdit || saving) return;
    const description = String(formData.get("description") || "").trim();
    const amount = Number(formData.get("amount") || 0);
    if (!description || !Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);
    const payload = {
      camporee_id: camporeeId,
      created_by: userId,
      description,
      amount,
      spent_on: String(formData.get("spent_on") || new Date().toISOString().slice(0,10)),
      category: String(formData.get("category") || "").trim() || null,
      paid_by: String(formData.get("paid_by") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
      area_id: String(formData.get("area_id") || "") || null,
    };
    const request = editing ? supabase.from("expenses").update(payload).eq("id", editing.id) : supabase.from("expenses").insert(payload);
    const { data, error } = await request.select("id,description,amount,spent_on,category,paid_by,notes,area_id").single();
    setSaving(false);
    if (!error && data) { setExpenses((current) => editing ? current.map((item) => item.id === data.id ? data : item) : [data, ...current]); setOpen(false); setEditing(null); }
  }

  async function removeExpense(id: string) {
    if (!canEdit) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (!error) setExpenses((current) => current.filter((item) => item.id !== id));
  }

  return <>
    <section className="section-card ios-card"><div className="section-head inside"><h3>Total registrado</h3><span>{expenses.length} movimientos</span></div><div style={{fontSize:32,fontWeight:900,letterSpacing:"-.04em"}}>RD${total.toLocaleString("es-DO", { maximumFractionDigits: 0 })}</div></section>
    <div className="panel-tools"><label className="panel-search"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar gasto, categoría o persona"/>{query ? <button onClick={()=>setQuery("")} aria-label="Limpiar"><X size={16}/></button> : null}</label>{categories.length ? <div className="filter-chips"><button className={category === "all" ? "active" : ""} onClick={()=>setCategory("all")}>Todos</button>{categories.map((item) => <button className={category === item ? "active" : ""} key={item} onClick={()=>setCategory(item)}>{item}</button>)}</div> : null}{canEdit ? <button className="panel-add" onClick={openNew}><Plus size={18}/> Registrar gasto</button> : null}</div>
    {open ? <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="sheet-card" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>{editing ? "Editar gasto" : "Nuevo gasto"}</h2><form action={saveExpense} className="panel-form"><input name="description" placeholder="Descripción" defaultValue={editing?.description || ""} required/><div className="form-two"><input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Monto RD$" defaultValue={editing?.amount || ""} required/><input name="spent_on" type="date" defaultValue={editing?.spent_on || new Date().toISOString().slice(0,10)} required/></div><div className="form-two"><input name="category" placeholder="Categoría" defaultValue={editing?.category || ""}/><select name="area_id" defaultValue={editing?.area_id || ""}><option value="">Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></div><input name="paid_by" placeholder="Pagado por" defaultValue={editing?.paid_by || ""}/><textarea name="notes" placeholder="Notas" defaultValue={editing?.notes || ""}/><button className="primary-btn" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar gasto"}</button></form></section></div> : null}
    <section className="panel-list">{visible.length ? visible.map((expense) => <article className="panel-row ios-card" key={expense.id}><span className="stat-icon stat-green"><DollarSign size={18}/></span><div className="panel-row-copy"><strong>{expense.description}</strong><small>{new Date(`${expense.spent_on}T00:00:00`).toLocaleDateString("es-DO", { dateStyle: "medium" })}{expense.category ? ` · ${expense.category}` : ""}</small><b>RD${Number(expense.amount || 0).toLocaleString("es-DO")}</b>{expense.paid_by ? <small>Pagado por {expense.paid_by}</small> : null}</div>{canEdit ? <div className="row-actions"><button className="row-icon-btn" onClick={()=>openEdit(expense)} aria-label="Editar"><Pencil size={16}/></button><button className="row-icon-btn danger" onClick={() => removeExpense(expense.id)} aria-label="Eliminar"><Trash2 size={17}/></button></div> : null}</article>) : <div className="empty compact">No hay gastos que coincidan con esta búsqueda.</div>}</section>
  </>;
}
