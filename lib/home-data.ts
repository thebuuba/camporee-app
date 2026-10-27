import type { CamporeeContext } from "@/lib/tenant-context";
import { signedAvatar } from './avatars';
import { dateKeyInTimeZone, dateOnlyDistance } from "@/lib/date";
import { camporeePhase } from "@/lib/camporee-preparation";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SupabaseResult<T> = { data: T; error: { message?: string } | null; count?: number | null };

async function retryQuery<T>(query: () => PromiseLike<SupabaseResult<T>>, attempts = 2) {
  let result = await query();
  for (let attempt = 1; result.error && attempt < attempts; attempt += 1) { await wait(100 * attempt); result = await query(); }
  return result;
}

export async function loadHomeData(context: CamporeeContext) {
  const { supabase, user, userId, camporee, membership: member } = context;
  const profileResult = await retryQuery(() => supabase.from("profiles").select("full_name,avatar_url,avatar_path").eq("id", userId).maybeSingle());
  if (profileResult.error) throw new Error(profileResult.error.message || "No se pudo cargar tu perfil.");
  const firstName = profileResult.data?.full_name?.split(" ")[0] || user.user_metadata?.full_name?.split(" ")[0] || "Conquistador";
  const avatarUrl = await signedAvatar(supabase,{...profileResult.data,id:userId});
  const memberLoadError = false;

  const now = new Date();
  const todayKey = dateKeyInTimeZone(now, camporee.time_zone);
  const phase = camporeePhase(camporee.status);
  const totalDays = Math.max(1, dateOnlyDistance(camporee.starts_on, camporee.ends_on) + 1);
  const dayNumber = phase === "during" ? Math.min(totalDays, Math.max(1, dateOnlyDistance(camporee.starts_on, todayKey) + 1)) : null;
  const days = phase === "before" ? Math.max(0, dateOnlyDistance(todayKey, camporee.starts_on)) : Math.max(0, dateOnlyDistance(todayKey, camporee.ends_on));

  const [summaryResult, urgentResult] = await Promise.all([
    retryQuery(() => supabase.rpc("get_camporee_home_summary", { target_camporee: camporee.id, as_of: now.toISOString() })),
    phase === "during"
      ? retryQuery(() => supabase.from("announcements").select("id,title,message,created_at").eq("camporee_id", camporee.id).eq("priority", "urgent").order("created_at", { ascending: false }).limit(1))
      : Promise.resolve({ data: [], error: null } as SupabaseResult<any[]>),
  ]);
  const contentError = summaryResult.error ?? urgentResult.error;
  if (contentError) throw new Error(contentError.message || "No se pudieron cargar los datos del camporee.");
  const summary = summaryResult.data;
  if (!summary || typeof summary.totalTasks !== "number") throw new Error("No se pudo cargar el resumen del camporee.");

  return {
    ...summary, initialNow: now.getTime(),
    userId, firstName, avatarUrl, member, memberLoadError, camporeeLoadError: false, camporee,
    days, phase, dayNumber, totalDays, urgentAnnouncement: urgentResult.data?.[0] ?? null,
  };
}
