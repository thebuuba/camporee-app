import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "../components/bottom-nav";
import TaskManager from "./task-manager";

export default async function TasksPage() {
  const supabase = await createClient();
  const auth = await supabase.auth.getClaims();
  const userId = auth.data?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: membership }, { data: camporees }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,status").order("starts_on", { ascending: true }),
  ]);
  if (!membership?.is_active) redirect("/login");
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.tasks);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];

  const [{ data: tasks }, { data: areas }] = camporee ? await Promise.all([
    supabase.from("tasks").select("id,title,description,status,priority,due_at,area_id,phase,task_checklist_items(id,label,is_done,sort_order)").eq("camporee_id", camporee.id).order("created_at", { ascending: false }),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order", { ascending: true }),
  ]) : [{ data: [] }, { data: [] }];

  return <main className="app panel-page">
    <header className="top"><div><div className="eyebrow">ORGANIZACIÓN</div><h1>Tareas</h1></div><span className="avatar"><CheckCircle2 size={22}/></span></header>
    <div className="panel-intro"><div><strong>{(tasks ?? []).filter((task) => task.status !== "done").length} pendientes</strong><small>Organiza lo que hay que hacer antes y durante el camporee.</small></div></div>
    {camporee ? <TaskManager camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialTasks={tasks ?? []} areas={areas ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
    <BottomNav />
  </main>;
}
