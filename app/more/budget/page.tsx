import Link from '@/app/components/tenant-link';
import { WalletCards } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import BudgetManager from "./budget-manager";
import { formatCamporeeMoney } from '@/lib/camporee-locale';
import { loadFinanceRows } from '@/lib/finance-data';

export default async function BudgetPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/budget');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('finances');

  const [{ data: expenses, error: expensesError }, { data: income, error: incomeError }, { data: areas, error: areasError }] = camporee ? await Promise.all([
    loadFinanceRows(supabase, camporee.id, 'expenses'),
    loadFinanceRows(supabase, camporee.id, 'income_entries'),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order"),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const totalExpenses = (expenses ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalIncome = (income ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const available = totalIncome - totalExpenses;

  const contentError = expensesError ?? incomeError ?? areasError;
  if (contentError) throw contentError;

  return <main className="app panel-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">FINANZAS</div><h1>Presupuesto</h1><p className="polymet-subtitle">Montos en {camporee.currency}</p></div><span className="avatar"><WalletCards size={22}/></span></header>
    <div className="panel-intro"><div><strong>{formatCamporeeMoney(available,camporee.currency)} disponibles</strong><small>Cuotas y aportes menos los gastos registrados.</small></div></div>
    {camporee ? <BudgetManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} userId={userId} canEdit={canEdit} currency={camporee.currency} timeZone={camporee.time_zone} initialExpenses={expenses ?? []} initialIncome={income ?? []} areas={areas ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
