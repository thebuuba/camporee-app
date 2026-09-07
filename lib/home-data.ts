import { createClient } from "@/lib/supabase/server";
import { dateKeyInTimeZone, dateOnlyDistance } from "@/lib/date";

export async function loadHomeData() {
  const supabase = await createClient();
  const auth = await supabase.auth.getClaims();
  const userId = auth.data?.claims?.sub;
  if (!userId) return null;
  const [profileResult, memberResult, camporeeResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,name,location,starts_on,ends_on,status").order("starts_on", { ascending: true }),
  ]);
  const initialError = profileResult.error ?? memberResult.error ?? camporeeResult.error;
  if (initialError) throw initialError;
  const profile = profileResult.data;
  const member = memberResult.data;
  const camporees = camporeeResult.data;
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];
  const firstName = profile?.full_name?.split(" ")[0] || "Conquistador";
  if (!camporee) return { firstName, member, camporee: null };

  const now = new Date();
  const todayKey = dateKeyInTimeZone(now);
  const isDuring = todayKey >= camporee.starts_on && todayKey <= camporee.ends_on;
  const isAfter = todayKey > camporee.ends_on || camporee.status === "finished";
  const phase: "before" | "during" | "after" = isAfter ? "after" : isDuring || camporee.status === "active" ? "during" : "before";
  const dayNumber = phase === "during" ? Math.max(1, dateOnlyDistance(camporee.starts_on, todayKey) + 1) : null;
  const totalDays = Math.max(1, dateOnlyDistance(camporee.starts_on, camporee.ends_on) + 1);
  const days = phase === "before" ? Math.max(0, dateOnlyDistance(todayKey, camporee.starts_on)) : Math.max(0, dateOnlyDistance(todayKey, camporee.ends_on));

  const [taskResult, participantResult, expenseResult, eventResult] = await Promise.all([
    supabase.from("tasks").select("id,title,status,priority,due_at").eq("camporee_id", camporee.id),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("camporee_id", camporee.id),
    supabase.from("expenses").select("amount").eq("camporee_id", camporee.id),
    supabase.from("schedule_events").select("id,title,starts_at,ends_at,location").eq("camporee_id", camporee.id).order("starts_at", { ascending: true }),
  ]);
  const contentError = taskResult.error ?? participantResult.error ?? expenseResult.error ?? eventResult.error;
  if (contentError) throw contentError;
  const tasks = taskResult.data ?? [];
  const events = eventResult.data ?? [];
  const pendingTasks = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
  const completed = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const totalExpenses = (expenseResult.data ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const todayTasks = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled" && task.due_at && dateKeyInTimeZone(task.due_at) === todayKey).sort((a,b) => (a.priority === "urgent" ? -1 : 0) - (b.priority === "urgent" ? -1 : 0)).slice(0,3);
  const nowMs = now.getTime();
  const currentEvent = events.find((event) => {
    const eventStart = new Date(event.starts_at).getTime();
    const eventEnd = event.ends_at ? new Date(event.ends_at).getTime() : eventStart + 60 * 60 * 1000;
    return nowMs >= eventStart && nowMs <= eventEnd;
  }) ?? null;
  const nextEvent = events.find((event) => new Date(event.starts_at).getTime() > nowMs) ?? null;

  return {
    firstName, member, camporee, pendingTasks, progress, totalExpenses,
    participants: participantResult.count ?? 0,
    days, phase, dayNumber, totalDays, programCount: events.length,
    currentEvent, nextEvent, todayTasks,
  };
}
