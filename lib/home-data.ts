import { createClient } from "@/lib/supabase/server";
import { dateKeyInTimeZone, dateOnlyDistance } from "@/lib/date";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SupabaseResult<T> = {
  data: T;
  error: { message?: string } | null;
  count?: number | null;
};

async function retryQuery<T>(query: () => PromiseLike<SupabaseResult<T>>, attempts = 2) {
  let result = await query();

  for (let attempt = 1; result.error && attempt < attempts; attempt += 1) {
    await wait(100 * attempt);
    result = await query();
  }

  return result;
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T) {
  return Promise.race([
    Promise.resolve(promise),
    wait(ms).then(() => fallback),
  ]);
}

export async function loadHomeData() {
  const supabase = await createClient();

  let authResult = await supabase.auth.getUser();
  for (let attempt = 1; (authResult.error || !authResult.data.user) && attempt < 3; attempt += 1) {
    await wait(100 * attempt);
    authResult = await supabase.auth.getUser();
  }

  const user = authResult.data.user;
  if (authResult.error || !user) return null;
  const userId = user.id;

  const [profileResult, memberResult, camporeeResult] = await Promise.all([
    retryQuery(() => supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle()),
    retryQuery(() => supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle()),
    retryQuery(() =>
      supabase.from("camporees")
        .select("id,name,location,starts_on,ends_on,status")
        .order("starts_on", { ascending: true })
    ),
  ]);

  const firstName = profileResult.data?.full_name?.split(" ")[0] || user.user_metadata?.full_name?.split(" ")[0] || "Conquistador";

  if (profileResult.error) console.error("Camporee profile load failed after retries", profileResult.error);
  if (memberResult.error) console.error("Camporee membership load failed after retries", memberResult.error);

  const member = memberResult.data ?? null;

  if (camporeeResult.error) {
    console.error("Camporee list load failed after retries", camporeeResult.error);
    return { firstName, member, camporee: null };
  }

  const camporees = camporeeResult.data ?? [];
  const camporee = camporees.find((item) => item.status !== "archived") ?? camporees[0];
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
    withTimeout(
      retryQuery(() => supabase.from("tasks").select("id,title,status,priority,due_at").eq("camporee_id", camporee.id), 1),
      1400,
      { data: [], error: { message: "timeout" } } as SupabaseResult<any[]>
    ),
    withTimeout(
      retryQuery(() => supabase.from("participants").select("id", { count: "exact", head: true }).eq("camporee_id", camporee.id), 1),
      1400,
      { data: null, error: { message: "timeout" }, count: 0 } as SupabaseResult<null>
    ),
    withTimeout(
      retryQuery(() => supabase.from("expenses").select("amount").eq("camporee_id", camporee.id), 1),
      1400,
      { data: [], error: { message: "timeout" } } as SupabaseResult<any[]>
    ),
    withTimeout(
      retryQuery(() => supabase.from("schedule_events").select("id,title,starts_at,ends_at,location").eq("camporee_id", camporee.id).order("starts_at", { ascending: true }), 1),
      1400,
      { data: [], error: { message: "timeout" } } as SupabaseResult<any[]>
    ),
  ]);

  const tasks = taskResult.data ?? [];
  const events = eventResult.data ?? [];
  const pendingTasks = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
  const completed = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const totalExpenses = (expenseResult.data ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const pendingToday = tasks
    .filter((task) => task.status !== "done" && task.status !== "cancelled" && task.due_at && dateKeyInTimeZone(task.due_at) === todayKey)
    .sort((a, b) => (a.priority === "urgent" ? -1 : 0) - (b.priority === "urgent" ? -1 : 0));
  const todayTasks = pendingToday.slice(0, 3);
  const todayProgramCount = events.filter((event) => dateKeyInTimeZone(event.starts_at) === todayKey).length;

  const nowMs = now.getTime();
  const currentEvent = events.find((event) => {
    const eventStart = new Date(event.starts_at).getTime();
    const eventEnd = event.ends_at ? new Date(event.ends_at).getTime() : eventStart + 60 * 60 * 1000;
    return nowMs >= eventStart && nowMs <= eventEnd;
  }) ?? null;
  const nextEvent = events.find((event) => new Date(event.starts_at).getTime() > nowMs) ?? null;

  return {
    firstName,
    member,
    camporee,
    pendingTasks,
    todayPendingTasks: pendingToday.length,
    progress,
    totalExpenses,
    participants: participantResult.count ?? 0,
    days,
    phase,
    dayNumber,
    totalDays,
    programCount: events.length,
    todayProgramCount,
    currentEvent,
    nextEvent,
    todayTasks,
  };
}
