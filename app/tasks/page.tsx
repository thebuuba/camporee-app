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

  const [{ data: membership, error: membershipError }, { data: camporees, error: camporeesError }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,status").order("starts_on", { ascending: true }),
  ]);
  if (membershipError || camporeesError) throw membershipError ?? camporeesError;
  if (!membership?.is_active) redirect("/");
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.tasks);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];

  const [{ data: tasks, error: tasksError }, { data: areas, error: areasError }, { data: activeMembers, error: membersError }] = camporee ? await Promise.all([
    supabase.from("tasks").select("id,title,description,status,priority,due_at,area_id,phase,assigned_to,task_checklist_items(id,label,is_done,sort_order)").eq("camporee_id", camporee.id).order("created_at", { ascending: false }),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order", { ascending: true }),
    supabase.from("app_members").select("user_id").eq("is_active", true),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  const activeUserIds = (activeMembers ?? []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = activeUserIds.length
    ? await supabase.from("profiles").select("id,full_name,email").in("id", activeUserIds).order("full_name", { ascending: true })
    : { data: [], error: null };

  const contentError = tasksError ?? areasError ?? membersError ?? profilesError;
  if (contentError) throw contentError;

  return <main className="app panel-page">
    <header className="top top-icon-only"><span className="avatar"><CheckCircle2 size={22}/></span></header>
    <div className="panel-intro"><div><strong>{(tasks ?? []).filter((task) => task.status !== "done" && task.status !== "cancelled").length} pendientes</strong><small>Organiza lo que hay que hacer antes y durante el camporee.</small></div></div>
    {camporee ? <TaskManager camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialTasks={tasks ?? []} areas={areas ?? []} assignees={profiles ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
    <BottomNav />
  </main>;
}
