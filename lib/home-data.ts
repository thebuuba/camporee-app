import { createClient } from "@/lib/supabase/server";

export async function loadHomeData() {
  const supabase = await createClient();
  const auth = await supabase.auth.getClaims();
  const userId = auth.data?.claims?.sub;
  if (!userId) return null;
  const [{ data: profile }, { data: member }, { data: camporees }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,name,location,starts_on,ends_on,status").order("starts_on", { ascending: true }),
  ]);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];
  const firstName = profile?.full_name?.split(" ")[0] || "Conquistador";
  if (!camporee) return { firstName, member, camporee: null };
  const [taskResult, participantResult, expenseResult] = await Promise.all([
    supabase.from("tasks").select("id,status").eq("camporee_id", camporee.id),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("camporee_id", camporee.id),
    supabase.from("expenses").select("amount").eq("camporee_id", camporee.id),
  ]);
  const tasks = taskResult.data ?? [];
  const pendingTasks = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
  const completed = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const totalExpenses = (expenseResult.data ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(`${camporee.starts_on}T00:00:00`);
  const days = Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));
  return { firstName, member, camporee, pendingTasks, progress, totalExpenses, participants: participantResult.count ?? 0, days };
}
