import Link from "next/link";
import { ArrowRight, Circle, CircleCheck, PartyPopper, Sparkles, Trophy, Users, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { closingProgress } from "@/lib/camporee-closing";

export default async function ClosingCard({ camporee }: { camporee: { id:string; starts_on:string; ends_on:string } }) {
  const supabase = await createClient();
  const [tasks, inventory, documents, notes, activities, participants, expenses, income] = await Promise.all([
    supabase.from("tasks").select("phase,status").eq("camporee_id", camporee.id),
    supabase.from("inventory_items").select("returned").eq("camporee_id", camporee.id),
    supabase.from("camporee_documents").select("id").eq("camporee_id", camporee.id).eq("document_type", "recibo"),
    supabase.from("notes").select("id").eq("camporee_id", camporee.id),
    supabase.from("camporee_activities").select("score,result").eq("camporee_id", camporee.id),
    supabase.from("participants").select("id").eq("camporee_id", camporee.id).eq("attendance_status", "checked_in"),
    supabase.from("expenses").select("amount").eq("camporee_id", camporee.id),
    supabase.from("income_entries").select("amount").eq("camporee_id", camporee.id),
  ]);
  const progress = closingProgress(tasks.data ?? [], inventory.data ?? []);
  const results = (activities.data ?? []).filter(activity => activity.score !== null || activity.result?.trim());
  const balance = (income.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0) - (expenses.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const formatDate = (value:string) => new Date(`${value}T12:00:00-04:00`).toLocaleDateString("es-DO", { day:"numeric", month:"long", year:"numeric", timeZone:"America/Santo_Domingo" });
  const start = new Date(`${camporee.starts_on}T12:00:00-04:00`);
  const end = new Date(`${camporee.ends_on}T12:00:00-04:00`);
  const dates = camporee.starts_on === camporee.ends_on ? formatDate(camporee.starts_on) : start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear() ? `${start.getUTCDate()} – ${formatDate(camporee.ends_on)}` : `${formatDate(camporee.starts_on)} – ${formatDate(camporee.ends_on)}`;
  const rows = [
    { href:"/tasks?phase=after", label:"Tareas de cierre", value:tasks.error ? "—" : `${progress.completed}/${progress.total}`, done:!tasks.error && progress.total > 0 && progress.completed === progress.total },
    { href:"/more/inventory", label:"Inventario devuelto", value:inventory.error ? "—" : `${progress.inventoryPercent}%`, done:!inventory.error && progress.inventoryComplete },
    { href:"/more/documents", label:"Recibos archivados", value:documents.error ? "—" : String(documents.data?.length ?? 0), done:!documents.error && Boolean(documents.data?.length) },
    { href:"/more/notes", label:"Apuntes del evento", value:notes.error ? "—" : notes.data?.length ? "Ver" : "Escribir", done:!notes.error && Boolean(notes.data?.length) },
  ];
  const loadError = [tasks, inventory, documents, notes, activities, participants, expenses, income].some(result => result.error);
  return <div className="closing-stage">
    <section className="closing-card" aria-label="Resumen final del camporee">
      <div className="closing-scene"><img src="/polymet-camp-finished.svg" alt=""/><div><span><PartyPopper size={14}/>Camporee finalizado</span><h2>¡Misión cumplida!</h2><p>{dates}</p></div></div>
      <div className="closing-stats">
        <Link href="/more/activities" className="closing-stat-gold"><Trophy size={16}/><strong>{activities.error ? "—" : results.length}</strong><small>{results.length ? "resultados" : "sin resultados"}</small></Link>
        <Link href="/more/participants" className="closing-stat-sage"><Users size={16}/><strong>{participants.error ? "—" : participants.data?.length ?? 0}</strong><small>participaron</small></Link>
        <Link href="/more/budget" className="closing-stat-peach"><WalletCards size={16}/><strong>{income.error || expenses.error ? "—" : `RD$ ${balance.toLocaleString("es-DO", {maximumFractionDigits:0})}`}</strong><small>saldo final</small></Link>
      </div>
    </section>
    <section className="closing-checklist" aria-label="Pendientes de cierre"><h2><Sparkles size={16}/>Para cerrar del todo</h2><div>{rows.map(row => <Link href={row.href} key={row.label} className={row.done ? "is-complete" : ""}>{row.done ? <CircleCheck size={20}/> : <Circle size={16}/>}<span>{row.label}</span><strong>{row.value}</strong><ArrowRight size={16}/></Link>)}</div>{loadError ? <p role="status">Algunos datos no se pudieron cargar. Abre el módulo para revisarlos.</p> : null}</section>
  </div>;
}
