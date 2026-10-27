'use client';

import BottomSheet from '@/app/components/bottom-sheet';
import { mutationProblem, mutationNotice } from '@/lib/mutation-result';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Search, Trash2, WalletCards, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval, reportMutationError, reportMutationSuccess } from "@/lib/client-ui";
import { dateKeyInTimeZone } from "@/lib/date";
import { formatCamporeeMoney } from '@/lib/camporee-locale';

type MovementType = 'expense' | 'income';
type BudgetManagerProps = { camporeeId: string; userId: string; canEdit: boolean; currency:string; timeZone:string; initialExpenses: any[]; initialIncome: any[]; areas: any[]; };

export default function BudgetManager({ camporeeId, userId, canEdit, currency, timeZone, initialExpenses, initialIncome, areas }: BudgetManagerProps) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [income, setIncome] = useState(initialIncome);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MovementType>('expense');
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<'all' | MovementType>('all');
  const supabase = createClient(); const router = useRouter();

  useEffect(() => { setExpenses(initialExpenses); }, [initialExpenses]);
  useEffect(() => { setIncome(initialIncome); }, [initialIncome]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0), [expenses]);
  const totalIncome = useMemo(() => income.reduce((sum, row) => sum + Number(row.amount || 0), 0), [income]);
  const balance = totalIncome - totalExpenses;
  const money = (value:number, digits=0) => formatCamporeeMoney(value,currency,digits);
  const movements = useMemo(() => [...expenses.map((row) => ({ ...row, movement_type: 'expense' as const, movement_date: row.spent_on, party: row.paid_by })),...income.map((row) => ({ ...row, movement_type: 'income' as const, movement_date: row.received_on, party: row.received_from }))].sort((a,b) => `${b.movement_date}${b.created_at ?? ''}`.localeCompare(`${a.movement_date}${a.created_at ?? ''}`)), [expenses, income]);
  const visible = useMemo(() => movements.filter((movement) => { const text = `${movement.description} ${movement.category || ''} ${movement.party || ''}`.toLowerCase(); return text.includes(query.toLowerCase()) && (filter === 'all' || movement.movement_type === filter); }), [movements, query, filter]);

  const days = useMemo(() => {
    const grouped = new Map<string, { date: string; movements: typeof visible; income: number; expenses: number }>();
    for (const movement of visible) {
      const date = movement.movement_date;
      const day = grouped.get(date) ?? { date, movements: [] as typeof visible, income: 0, expenses: 0 };
      day.movements.push(movement);
      if (movement.movement_type === 'income') day.income += Number(movement.amount || 0);
      else day.expenses += Number(movement.amount || 0);
      grouped.set(date, day);
    }
    return [...grouped.values()];
  }, [visible]);

  function openNew(nextKind:MovementType = 'expense') { setKind(nextKind); setEditing(null); setFormError(''); setOpen(true); }
  function openEdit(movement:any) { setKind(movement.movement_type); setEditing(movement); setFormError(''); setOpen(true); }
  function closeSheet(){if(saving)return;setOpen(false);setEditing(null);setFormError('')}

  async function saveMovement(formData: FormData) {
    if (!canEdit || saving) return;
    const description = String(formData.get("description") || "").trim(); const amount = Number(formData.get("amount") || 0);
    if (!description || !Number.isFinite(amount) || amount <= 0){setFormError('Completa una descripción y un monto mayor que cero.');return;}
    setSaving(true);setFormError('');
    try{
      let savedStatus: number | undefined;
      if (kind === 'expense') {
        const payload:any = { camporee_id: camporeeId, description, amount, spent_on: String(formData.get("movement_date") || dateKeyInTimeZone(new Date(), timeZone)), category: String(formData.get("category") || "").trim() || null, paid_by: String(formData.get("party") || "").trim() || null, notes: String(formData.get("notes") || "").trim() || null, area_id: String(formData.get("area_id") || "") || null };
        if (!editing) payload.created_by = userId;
        const request = editing ? supabase.from("expenses").update(payload).eq("id", editing.id).eq("camporee_id",camporeeId) : supabase.from("expenses").insert(payload);
        const result = await request.select("id,description,amount,spent_on,category,paid_by,notes,area_id,created_at").single();
        const { data } = result; const error = mutationProblem(result,editing?[editing.id]:undefined);
        savedStatus = result.status;
        if(error||!data){const message=reportMutationError(error,'No se pudo guardar el gasto.');setFormError(message);return;}
        setExpenses((current) => editing ? current.map((item) => item.id === data.id ? data : item) : [data, ...current]);
      } else {
        const payload:any = { camporee_id: camporeeId, description, amount, received_on: String(formData.get("movement_date") || dateKeyInTimeZone(new Date(), timeZone)), category: String(formData.get("category") || "").trim() || null, received_from: String(formData.get("party") || "").trim() || null, notes: String(formData.get("notes") || "").trim() || null };
        if (!editing) payload.created_by = userId;
        const request = editing ? supabase.from("income_entries").update(payload).eq("id", editing.id).eq('camporee_id',camporeeId) : supabase.from("income_entries").insert(payload);
        const result = await request.select("id,description,amount,received_on,category,received_from,notes,created_at").single();
        const { data } = result; const error = mutationProblem(result,editing?[editing.id]:undefined);
        savedStatus = result.status;
        if(error||!data){const message=reportMutationError(error,'No se pudo guardar el ingreso.');setFormError(message);return;}
        setIncome((current) => editing ? current.map((item) => item.id === data.id ? data : item) : [data, ...current]);
      }
      reportMutationSuccess(mutationNotice(savedStatus,editing?'Movimiento actualizado.':'Movimiento guardado.'));setOpen(false);setEditing(null);if (savedStatus !== 202) router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo guardar el movimiento.');setFormError(message)}finally{setSaving(false)}
  }

  async function removeMovement(movement:any) {
    if (!canEdit || !confirmRemoval('este movimiento')) return;
    try {
      const table = movement.movement_type === 'income' ? 'income_entries' : 'expenses';
      const result = await supabase.from(table).delete().eq('id', movement.id).eq('camporee_id',camporeeId).select('id');
      const error = mutationProblem(result,[movement.id]);
      if (error) throw error;
      if (movement.movement_type === 'income') setIncome((current) => current.filter((item) => item.id !== movement.id)); else setExpenses((current) => current.filter((item) => item.id !== movement.id));
      reportMutationSuccess(mutationNotice(result.status,'Movimiento eliminado.'));setOpen(false);setEditing(null);if (result.status !== 202) router.refresh();
    } catch(error) {reportMutationError(error,'No se pudo eliminar el movimiento.');}
  }

  const movementDate = editing ? (kind === 'income' ? editing.received_on : editing.spent_on) : dateKeyInTimeZone(new Date(), timeZone); const party = editing ? (kind === 'income' ? editing.received_from : editing.paid_by) : '';
  const categories = Object.entries(expenses.reduce<Record<string, number>>((totals, row) => { const name = row.category?.trim() || 'Sin categoría'; totals[name] = (totals[name] || 0) + Number(row.amount || 0); return totals; }, {})).sort((a, b) => b[1] - a[1]);
  const usage = totalIncome > 0 ? Math.round(totalExpenses / totalIncome * 100) : 0;
  return <>
    <section className="budget-summary"><div className="budget-balance ios-card"><span>Saldo disponible</span><strong className={balance < 0 ? 'negative' : ''}>{money(balance)}</strong><div className="polymet-budget-usage" aria-label={`${usage}% del ingreso utilizado`} style={{'--usage': `${Math.min(usage, 100)}%`} as React.CSSProperties}><i/><small>{usage}% del ingreso utilizado</small></div></div><div className="budget-mini ios-card income"><ArrowDownLeft size={18}/><div><span>Ingresos</span><strong>{money(totalIncome)}</strong></div></div><div className="budget-mini ios-card expense"><ArrowUpRight size={18}/><div><span>Gastos</span><strong>{money(totalExpenses)}</strong></div></div></section>
    {categories.length ? <section className="polymet-budget-categories ios-card"><strong>Gastos por categoría</strong><div className="polymet-category-bar">{categories.map(([name, amount], index) => <span key={name} style={{width:`${totalExpenses ? amount / totalExpenses * 100 : 0}%`,backgroundColor:['#fa8943','#78a556','#5badd7','#f8b935','#b987d8'][index % 5]}}/>)}</div><div className="polymet-category-legend">{categories.map(([name, amount], index) => <div key={name}><i style={{backgroundColor:['#fa8943','#78a556','#5badd7','#f8b935','#b987d8'][index % 5]}}/><span>{name}</span><b>{money(amount)}</b></div>)}</div></section> : null}
    <div className="panel-tools"><label className="panel-search"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar movimiento o persona"/>{query ? <button type="button" onClick={()=>setQuery("")} aria-label="Limpiar"><X size={16}/></button> : null}</label><div className="filter-chips"><button type="button" className={filter === 'all' ? 'active' : ''} onClick={()=>setFilter('all')}>Todos</button><button type="button" className={filter === 'income' ? 'active' : ''} onClick={()=>setFilter('income')}>Ingresos</button><button type="button" className={filter === 'expense' ? 'active' : ''} onClick={()=>setFilter('expense')}>Gastos</button></div>{canEdit ? <div className="budget-add-row"><button type="button" className="panel-add" onClick={()=>openNew()}><Plus size={18}/> Movimiento</button></div> : null}</div>
    <BottomSheet open={open} onClose={closeSheet} title={editing ? 'Editar movimiento' : 'Nuevo movimiento'} busy={saving}>
      <form onSubmit={(event)=>{event.preventDefault();void saveMovement(new FormData(event.currentTarget));}} className="panel-form pm-sheet-form">
        <div className="pm-sheet-fields">
          {formError ? <div className="auth-alert error" role="alert">{formError}</div> : null}
          <div className="form-two">
            <label className="pm-field"><span>Tipo</span><select name="type" value={kind} onChange={event=>setKind(event.target.value as MovementType)} disabled={Boolean(editing)}><option value="income">Ingreso</option><option value="expense">Gasto</option></select></label>
            <label className="pm-field"><span>Monto ({currency}) <b className="pm-required">*</b></span><input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={editing?.amount ?? ''} required/></label>
          </div>
          <label className="pm-field"><span>Concepto <b className="pm-required">*</b></span><input name="description" defaultValue={editing?.description || ''} required/></label>
          <input type="hidden" name="category" defaultValue={editing?.category || ''}/>
          <label className="pm-field"><span>Fecha</span><input name="movement_date" type="date" defaultValue={movementDate}/></label>
          <input type="hidden" name="area_id" value={editing?.area_id || ''}/><input type="hidden" name="party" value={party || ''}/><input type="hidden" name="notes" value={editing?.notes || ''}/>
        </div>
        <div className="pm-sheet-footer">{editing ? <button type="button" className="row-icon-btn danger" aria-label="Eliminar" disabled={saving} onClick={()=>void removeMovement(editing)}><Trash2 size={20}/></button> : null}<button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </BottomSheet>
    <div className="budget-days">{days.length ? days.map((day) => <section className="budget-day" key={day.date} aria-labelledby={`budget-day-${day.date}`}>
      <header className="budget-day-heading"><h2 id={`budget-day-${day.date}`}><time dateTime={day.date}>{new Date(`${day.date}T00:00:00`).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</time></h2><dl className="budget-day-totals"><div><dt>Ingresos</dt><dd className="money-in">{money(day.income, 2)}</dd></div><div><dt>Gastos</dt><dd className="money-out">{money(day.expenses, 2)}</dd></div><div><dt>Saldo del día</dt><dd className={day.income - day.expenses < 0 ? 'money-out' : 'money-in'}>{money(day.income - day.expenses, 2)}</dd></div></dl></header>
      <div className="panel-list">{day.movements.map((movement) => <article className="panel-row ios-card" key={`${movement.movement_type}-${movement.id}`}><span className={`stat-icon ${movement.movement_type === 'income' ? 'stat-green' : 'stat-red'}`}>{movement.movement_type === 'income' ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span><div className="panel-row-copy"><strong>{movement.description}</strong><small>{new Date(`${movement.movement_date}T00:00:00`).toLocaleDateString("es-DO", { dateStyle: "medium" })}{movement.category ? ` · ${movement.category}` : ""}</small><b className={movement.movement_type === 'income' ? 'money-in' : 'money-out'}>{movement.movement_type === 'income' ? '+' : '−'} {money(Number(movement.amount || 0),2)}</b>{movement.party ? <small>{movement.movement_type === 'income' ? 'Recibido de' : 'Pagado por'} {movement.party}</small> : null}</div>{canEdit ? <div className="row-actions"><button type="button" className="row-icon-btn" onClick={()=>openEdit(movement)} aria-label="Editar"><Pencil size={16}/></button><button type="button" className="row-icon-btn danger" onClick={() => removeMovement(movement)} aria-label="Eliminar"><Trash2 size={17}/></button></div> : null}</article>)}</div></section>) : <div className="empty compact"><WalletCards size={22}/> No hay movimientos que coincidan con esta búsqueda.</div>}</div>
  </>;
}
