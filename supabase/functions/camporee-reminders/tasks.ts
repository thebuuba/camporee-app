import { enqueueDelivery } from './delivery.ts';
// Queue one durable overdue-task summary per user/camporee/local date.
const FALLBACK_TIME_ZONE = "America/Santo_Domingo";
const START_HOUR = 9;
const CLOSED_STATUSES = ["finished", "archived"];
const DONE_STATUSES = ["done", "cancelled"];

function dateKeyInZone(timeZone: string, date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function hourInZone(timeZone: string, date: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", hourCycle: "h23",
  }).format(date));
}

function truncateTitle(title: any) {
  const chars = [...String(title ?? "")];
  return chars.slice(0, 120).join("");
}

function overdueSummary(tasks: any[]) {
  const titles = tasks.slice(0, 3).map((task) => `“${truncateTitle(task.title)}”`);
  const extra = tasks.length - titles.length;
  const list = extra > 0 ? `${titles.join(", ")} y ${extra} más` : titles.join(" y ");
  const count = tasks.length === 1 ? "1 tarea atrasada" : `${tasks.length} tareas atrasadas`;
  return `Tienes ${count}: ${list}.`;
}

export async function sendTaskOverdueReminders(supabase: any, webpush: any, now = new Date()) {
  const { data: camporees, error: camporeeError } = await supabase.from("camporees")
    .select("id,organization_id,time_zone,status").neq("status", "archived");
  if (camporeeError) throw camporeeError;
  for (const camporee of camporees ?? []) {
    if (CLOSED_STATUSES.includes(camporee.status)) continue;
    const timeZone = camporee.time_zone || FALLBACK_TIME_ZONE;
    if (hourInZone(timeZone, now) < START_HOUR) continue;
    const today = dateKeyInZone(timeZone, now);
    const milestone = `task-overdue:${today}`;
    const { data: members, error: membersError } = await supabase.from("organization_members")
      .select("user_id").eq("organization_id", camporee.organization_id).eq("is_active", true);
    if (membersError) throw membersError;
    const activeMembers = new Set((members ?? []).map((member: any) => member.user_id));
    if (!activeMembers.size) continue;
    const { data: tasks, error: tasksError } = await supabase.from("tasks")
      .select("id,title,due_at,assigned_to,status").eq("camporee_id", camporee.id)
      .neq("status", "done").neq("status", "cancelled").lte("due_at", now.toISOString());
    if (tasksError) throw tasksError;
    const overdueByUser = new Map<string, any[]>();
    for (const task of tasks ?? []) {
      if (!task.due_at || !task.assigned_to) continue;
      if (DONE_STATUSES.includes(task.status)) continue;
      if (!activeMembers.has(task.assigned_to)) continue;
      if (dateKeyInZone(timeZone, new Date(task.due_at)) >= today) continue;
      const list = overdueByUser.get(task.assigned_to) ?? [];
      list.push(task);
      overdueByUser.set(task.assigned_to, list);
    }
    if (!overdueByUser.size) continue;
    for (const [userId, overdue] of overdueByUser) {
      const { data: subscriptions, error: subscriptionsError } = await supabase.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth").contains("camporee_ids", [camporee.id]).eq("user_id", userId);
      if (subscriptionsError) throw subscriptionsError;
      if (!subscriptions?.length) continue;
      const payload = JSON.stringify({
        title: "Tareas atrasadas",
        body: overdueSummary(overdue),
        url: `/o/${camporee.organization_id}/c/${camporee.id}/tasks`,
        tag: `task-overdue-${camporee.id}-${today}`,
      });
      await enqueueDelivery(supabase, camporee.id, userId, milestone, JSON.parse(payload), 86400,
        new Date(now.getTime() + 24 * 60 * 60_000));
    }
  }
  return {sent: 0, stale: 0};
}
