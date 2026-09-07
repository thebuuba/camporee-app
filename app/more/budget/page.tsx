import Link from "next/link";
import { redirect } from "next/navigation";
import { WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BudgetManager from "./budget-manager";

export default async function BudgetPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: membership, error: membershipError }, { data: camporees, error: camporeesError }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,status").order("starts_on", { ascending: true }),
  ]);
  if (membershipError || camporeesError) throw membershipError ?? camporeesError;
  if (!membership?.is_active) redirect("/");
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.finances);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];

  const [{ data: expenses, error: expensesError }, { data: income, error: incomeError }, { data: areas, error: areasError }] = camporee ? await Promise.all([
    supabase.from("expenses").select("id,description,amount,spent_on,category,paid_by,notes,area_id,created_at").eq("camporee_id", camporee.id).order("spent_on", { ascending: false }),
    supabase.from("income_entries").select("id,description,amount,received_on,category,received_from,notes,created_at").eq("camporee_id", camporee.id).order("received_on", { ascending: false }),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order"),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const totalExpenses = (expenses ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalIncome = (income ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const available = totalIncome - totalExpenses;

  const contentError = expensesError ?? incomeError ?? areasError;
  if (contentError) throw contentError;

  return <main className="app panel-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">FINANZAS</div><h1>Presupuesto</h1></div><span className="avatar"><WalletCards size={22}/></span></header>
    <div className="panel-intro"><div><strong>RD${available.toLocaleString("es-DO", { maximumFractionDigits: 0 })} disponibles</strong><small>Cuotas y aportes menos los gastos registrados.</small></div></div>
    {camporee ? <BudgetManager camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialExpenses={expenses ?? []} initialIncome={income ?? []} areas={areas ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
