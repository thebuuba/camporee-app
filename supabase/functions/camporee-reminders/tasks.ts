// Daily overdue-task summary. Claims one log row per user/camporee/local date
// with the existing unique key before sending, so the every-minute cron cannot
// notify twice a day.
const VAPID_SUBJECT = "mailto:notifications@example.com";
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
  let sent = 0;
  const stale: string[] = [];
  for (const camporee of camporees ?? []) {
    if (CLOSED_STATUSES.includes(camporee.status)) continue;
    const timeZone = camporee.time_zone || FALLBACK_TIME_ZONE;
    if (hourInZone(timeZone, now) < START_HOUR) continue;
    const today = dateKeyInZone(timeZone, now);
    const milestone = `task-overdue:${today}`;
    const { data: notified, error: notifiedError } = await supabase.from("system_push_reminder_log")
      .select("user_id").eq("camporee_id", camporee.id).eq("milestone", milestone);
    if (notifiedError) throw notifiedError;
    const notifiedUsers = new Set((notified ?? []).map((row: any) => row.user_id));
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
      if (notifiedUsers.has(task.assigned_to)) continue;
      if (!activeMembers.has(task.assigned_to)) continue;
      if (dateKeyInZone(timeZone, new Date(task.due_at)) >= today) continue;
      const list = overdueByUser.get(task.assigned_to) ?? [];
      list.push(task);
      overdueByUser.set(task.assigned_to, list);
    }
    if (!overdueByUser.size) continue;
    const { data: keys, error: keysError } = await supabase.from("push_vapid_keys").select("public_key,private_key").eq("singleton", true).maybeSingle();
    if (keysError || !keys?.public_key || !keys?.private_key) throw keysError ?? new Error("Push keys unavailable");
    webpush.setVapidDetails(VAPID_SUBJECT, keys.public_key, keys.private_key);
    for (const [userId, overdue] of overdueByUser) {
      const { data: subscriptions, error: subscriptionsError } = await supabase.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth").contains("camporee_ids", [camporee.id]).eq("user_id", userId);
      if (subscriptionsError) throw subscriptionsError;
      if (!subscriptions?.length) continue;
      const { data: claim, error: claimError } = await supabase.from("system_push_reminder_log")
        .insert({camporee_id: camporee.id, user_id: userId, milestone}).select("id").single();
      if (claimError?.code === "23505") continue;
      if (claimError || !claim) throw claimError ?? new Error("Reminder claim unavailable");
      const payload = JSON.stringify({
        title: "Tareas atrasadas",
        body: overdueSummary(overdue),
        url: `/o/${camporee.organization_id}/c/${camporee.id}/tasks`,
        tag: `task-overdue-${camporee.id}-${today}`,
      });
      let delivered = 0;
      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification({endpoint: subscription.endpoint, keys: {p256dh: subscription.p256dh, auth: subscription.auth}}, payload, {TTL: 86400});
          delivered++;sent++;
        } catch (error: any) {
          if ([404,410].includes(error?.statusCode)) stale.push(subscription.id);
          else console.error("Overdue task reminder push failed", error?.statusCode ?? error?.message);
        }
      }
      if (!delivered) {
        const {error} = await supabase.from("system_push_reminder_log").delete().eq("id", claim.id);
        if (error) throw error;
      }
    }
  }
  if (stale.length) {
    const {error} = await supabase.from("push_subscriptions").delete().in("id", stale);
    if (error) throw error;
  }
  return {sent, stale: stale.length};
}
