import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import { loadTaskAssignees } from "@/lib/task-assignees";
import BottomNav from "../components/bottom-nav";
import TaskManager from "./task-manager";

export default async function TasksPage({ searchParams, params }: { searchParams: Promise<{ phase?: string | string[] }>; params?: TenantPageParams }) {
  const requestedPhase = (await searchParams).phase;
  const initialPhase = typeof requestedPhase === "string" && ["before", "during", "after"].includes(requestedPhase) ? requestedPhase : "all";
  const context = await requireCamporeeContext(params, '/tasks', searchParams);
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('tasks');

  const [{ data: tasks, error: tasksError }, { data: areas, error: areasError }, { data: profiles, error: profilesError }] = camporee ? await Promise.all([
    supabase.from("tasks").select("id,title,description,status,priority,due_at,area_id,phase,assigned_to,task_checklist_items(id,label,is_done,sort_order)").eq("camporee_id", camporee.id).order("created_at", { ascending: false }),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order", { ascending: true }),
    loadTaskAssignees(supabase, context.organizationId),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  const contentError = tasksError ?? areasError ?? profilesError;
  if (contentError) throw contentError;

  return <main className="app panel-page">
    <header className="polymet-panel-heading"><h1>Tareas</h1><p>{(tasks ?? []).filter((task) => task.status === "done").length} de {(tasks ?? []).length} completadas</p></header>
    {camporee ? <TaskManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialTasks={tasks ?? []} areas={areas ?? []} assignees={profiles ?? []} initialPhase={initialPhase} timeZone={camporee.time_zone}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
    <BottomNav />
  </main>;
}
