'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Search, Trash2, WalletCards, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval } from "@/lib/client-ui";
import { dateKeyInTimeZone } from "@/lib/date";

type MovementType = 'expense' | 'income';

type BudgetManagerProps = {
  camporeeId: string;
  userId: string;
  canEdit: boolean;
  initialExpenses: any[];
  initialIncome: any[];
  areas: any[];
};

export default function BudgetManager({ camporeeId, userId, canEdit, initialExpenses, initialIncome, areas }: BudgetManagerProps) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [income, setIncome] = useState(initialIncome);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MovementType>('expense');
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<'all' | MovementType>('all');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setExpenses(initialExpenses); }, [initialExpenses]);
  useEffect(() => { setIncome(initialIncome); }, [initialIncome]);

  const totalExpenses = useMemo(() => expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0), [expenses]);
  const totalIncome = useMemo(() => income.reduce((sum, row) => sum + Number(row.amount || 0), 0), [income]);
  const balance = totalIncome - totalExpenses;
  const movements = useMemo(() => [
    ...expenses.map((row) => ({ ...row, movement_type: 'expense' as const, movement_date: row.spent_on, party: row.paid_by })),
    ...income.map((row) => ({ ...row, movement_type: 'income' as const, movement_date: row.received_on, party: row.received_from })),
  ].sort((a,b) => `${b.movement_date}${b.created_at ?? ''}`.localeCompare(`${a.movement_date}${a.created_at ?? ''}`)), [expenses, income]);
  const visible = useMemo(() => movements.filter((movement) => {
    const text = `${movement.description} ${movement.category || ''} ${movement.party || ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || movement.movement_type === filter);
  }), [movements, query, filter]);

  function openNew(nextKind:MovementType) { setKind(nextKind); setEditing(null); setOpen(true); }
  function openEdit(movement:any) { setKind(movement.movement_type); setEditing(movement); setOpen(true); }

  async function saveMovement(formData: FormData) {
    if (!canEdit || saving) return;
    const description = String(formData.get("description") || "").trim();
    const amount = Number(formData.get("amount") || 0);
    if (!description || !Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);

    if (kind === 'expense') {
      const payload:any = {
        camporee_id: camporeeId,
        description,
        amount,
        spent_on: String(formData.get("movement_date") || dateKeyInTimeZone()),
        category: String(formData.get("category") || "").trim() || null,
        paid_by: String(formData.get("party") || "").trim() || null,
        notes: String(formData.get("notes") || "").trim() || null,
        area_id: String(formData.get("area_id") || "") || null,
      };
      if (!editing) payload.created_by = userId;
      const request = editing ? supabase.from("expenses").update(payload).eq("id", editing.id) : supabase.from("expenses").insert(payload);
      const { data, error } = await request.select("id,description,amount,spent_on,category,paid_by,notes,area_id,created_at").single();
      if (!error && data) setExpenses((current) => editing ? current.map((item) => item.id === data.id ? data : item) : [data, ...current]);
      if (error) { setSaving(false); return; }
    } else {
      const payload:any = {
        camporee_id: camporeeId,
        description,
        amount,
        received_on: String(formData.get("movement_date") || dateKeyInTimeZone()),
        category: String(formData.get("category") || "").trim() || null,
        received_from: String(formData.get("party") || "").trim() || null,
        notes: String(formData.get("notes") || "").trim() || null,
      };
      if (!editing) payload.created_by = userId;
      const request = editing ? supabase.from("income_entries").update(payload).eq("id", editing.id) : supabase.from("income_entries").insert(payload);
      const { data, error } = await request.select("id,description,amount,received_on,category,received_from,notes,created_at").single();
      if (!error && data) setIncome((current) => editing ? current.map((item) => item.id === data.id ? data : item) : [data, ...current]);
      if (error) { setSaving(false); return; }
    }

    setSaving(false); setOpen(false); setEditing(null); router.refresh();
  }

  async function removeMovement(movement:any) {
    if (!canEdit || !confirmRemoval('este movimiento')) return;
    const previousExpenses = expenses;
    const previousIncome = income;
    if (movement.movement_type === 'income') setIncome((current) => current.filter((item) => item.id !== movement.id));
    else setExpenses((current) => current.filter((item) => item.id !== movement.id));
    const table = movement.movement_type === 'income' ? 'income_entries' : 'expenses';
    const { error } = await supabase.from(table).delete().eq('id', movement.id);
    if (error) { setExpenses(previousExpenses); setIncome(previousIncome); return; }
    router.refresh();
  }

  const movementDate = editing ? (kind === 'income' ? editing.received_on : editing.spent_on) : dateKeyInTimeZone();
  const party = editing ? (kind === 'income' ? editing.received_from : editing.paid_by) : '';

  return <>
    <section className="budget-summary">
      <div className="budget-balance ios-card"><span>Disponible</span><strong className={balance < 0 ? 'negative' : ''}>RD${balance.toLocaleString('es-DO',{maximumFractionDigits:0})}</strong><small>Ingresos menos gastos</small></div>
      <div className="budget-mini ios-card income"><ArrowDownLeft size={18}/><div><span>Ingresos</span><strong>RD${totalIncome.toLocaleString('es-DO',{maximumFractionDigits:0})}</strong></div></div>
      <div className="budget-mini ios-card expense"><ArrowUpRight size={18}/><div><span>Gastos</span><strong>RD${totalExpenses.toLocaleString('es-DO',{maximumFractionDigits:0})}</strong></div></div>
    </section>

    <div className="panel-tools">
      <label className="panel-search"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar movimiento o persona"/>{query ? <button type="button" onClick={()=>setQuery("")} aria-label="Limpiar"><X size={16}/></button> : null}</label>
      <div className="filter-chips"><button className={filter === 'all' ? 'active' : ''} onClick={()=>setFilter('all')}>Todos</button><button className={filter === 'income' ? 'active' : ''} onClick={()=>setFilter('income')}>Ingresos</button><button className={filter === 'expense' ? 'active' : ''} onClick={()=>setFilter('expense')}>Gastos</button></div>
      {canEdit ? <div className="budget-add-row"><button className="panel-add income-add" onClick={()=>openNew('income')}><ArrowDownLeft size={18}/> Ingreso</button><button className="panel-add" onClick={()=>openNew('expense')}><Plus size={18}/> Gasto</button></div> : null}
    </div>

    {open ? <div className="sheet-backdrop" onClick={() => {setOpen(false);setEditing(null)}}><section className="sheet-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><div className="sheet-title-row"><span className={`stat-icon ${kind === 'income' ? 'stat-green' : 'stat-red'}`}>{kind === 'income' ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span><h2>{editing ? 'Editar' : 'Nuevo'} {kind === 'income' ? 'ingreso' : 'gasto'}</h2></div><form action={saveMovement} className="panel-form"><input name="description" placeholder={kind === 'income' ? 'Cuota, aporte, donación…' : 'Transporte, comida, materiales…'} defaultValue={editing?.description || ""} required/><div className="form-two"><input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Monto RD$" defaultValue={editing?.amount || ""} required/><input name="movement_date" type="date" defaultValue={movementDate} required/></div><input name="category" placeholder="Categoría" defaultValue={editing?.category || ""}/>{kind === 'expense' ? <select name="area_id" defaultValue={editing?.area_id || ""}><option value="">Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select> : null}<input name="party" placeholder={kind === 'income' ? 'Recibido de' : 'Pagado por'} defaultValue={party || ""}/><textarea name="notes" placeholder="Notas" defaultValue={editing?.notes || ""}/><button className="primary-btn" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : kind === 'income' ? 'Guardar ingreso' : 'Guardar gasto'}</button></form></section></div> : null}

    <section className="panel-list">{visible.length ? visible.map((movement) => <article className="panel-row ios-card" key={`${movement.movement_type}-${movement.id}`}><span className={`stat-icon ${movement.movement_type === 'income' ? 'stat-green' : 'stat-red'}`}>{movement.movement_type === 'income' ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span><div className="panel-row-copy"><strong>{movement.description}</strong><small>{new Date(`${movement.movement_date}T00:00:00`).toLocaleDateString("es-DO", { dateStyle: "medium" })}{movement.category ? ` · ${movement.category}` : ""}</small><b className={movement.movement_type === 'income' ? 'money-in' : 'money-out'}>{movement.movement_type === 'income' ? '+' : '−'} RD${Number(movement.amount || 0).toLocaleString("es-DO")}</b>{movement.party ? <small>{movement.movement_type === 'income' ? 'Recibido de' : 'Pagado por'} {movement.party}</small> : null}</div>{canEdit ? <div className="row-actions"><button className="row-icon-btn" onClick={()=>openEdit(movement)} aria-label="Editar"><Pencil size={16}/></button><button className="row-icon-btn danger" onClick={() => removeMovement(movement)} aria-label="Eliminar"><Trash2 size={17}/></button></div> : null}</article>) : <div className="empty compact"><WalletCards size={22}/> No hay movimientos que coincidan con esta búsqueda.</div>}</section>
  </>;
}
