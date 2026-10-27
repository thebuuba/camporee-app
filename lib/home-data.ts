import type { CamporeeContext } from "@/lib/tenant-context";
import { signedAvatar } from './avatars';
import { dateKeyInTimeZone, dateOnlyDistance } from "@/lib/date";
import { camporeePhase } from "@/lib/camporee-preparation";
import type {CamporeeCardData} from '@/lib/camporee-card';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SupabaseResult<T> = { data: T; error: { message?: string } | null; count?: number | null };

async function retryQuery<T>(query: () => PromiseLike<SupabaseResult<T>>, attempts = 2) {
  let result = await query();
  for (let attempt = 1; result.error && attempt < attempts; attempt += 1) { await wait(100 * attempt); result = await query(); }
  return result;
}

async function loadCardData(context:CamporeeContext,now:Date,phase:'before'|'during'|'after'):Promise<CamporeeCardData>{
  const {supabase,camporeeId}=context;
  const data:CamporeeCardData={organizationName:context.organization.name,canEditTasks:context.canEdit('tasks'),tasks:[],schedule:[],results:[],resultCount:0,people:[],loadError:false};
  if(phase==='before'){
    const tasks=await supabase.from('tasks').select('id,title,areas(name)').eq('camporee_id',camporeeId).eq('phase','before').neq('status','done').neq('status','cancelled').order('due_at',{ascending:true,nullsFirst:false}).order('id').limit(3);
    data.tasks=(tasks.data??[]) as unknown as CamporeeCardData['tasks'];data.loadError=Boolean(tasks.error);
  }else if(phase==='during'){
    const schedule=await supabase.from('schedule_events').select('id,title,starts_at,ends_at,location').eq('camporee_id',camporeeId)
      .gte('starts_at',new Date(now.getTime()-2*86400000).toISOString()).lte('starts_at',new Date(now.getTime()+8*86400000).toISOString()).order('starts_at').order('id').limit(200);
    data.schedule=schedule.data??[];data.loadError=Boolean(schedule.error);
  }else{
    const results=await supabase.from('camporee_activities').select('id,title,activity_type,score,result',{count:'exact'}).eq('camporee_id',camporeeId).or('score.not.is.null,result.not.is.null').order('starts_at',{ascending:false,nullsFirst:false}).order('id').limit(3);
    data.results=results.data??[];data.resultCount=results.count??0;data.loadError=Boolean(results.error);
  }
  return data;
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

  const [summaryResult, urgentResult, cardData] = await Promise.all([
    retryQuery(() => supabase.rpc("get_camporee_home_summary", { target_camporee: camporee.id, as_of: now.toISOString() })),
    phase === "during"
      ? retryQuery(() => supabase.from("announcements").select("id,title,message,created_at").eq("camporee_id", camporee.id).eq("priority", "urgent").order("created_at", { ascending: false }).limit(1))
      : Promise.resolve({ data: [], error: null } as SupabaseResult<any[]>),
    loadCardData(context,now,phase),
  ]);
  const contentError = summaryResult.error ?? urgentResult.error;
  if (contentError) throw new Error(contentError.message || "No se pudieron cargar los datos del camporee.");
  const summary = summaryResult.data;
  if (!summary || typeof summary.totalTasks !== "number") throw new Error("No se pudo cargar el resumen del camporee.");

  return {
    ...summary, initialNow: now.getTime(), cardData,
    userId, firstName, avatarUrl, member, memberLoadError, camporeeLoadError: false, camporee,
    days, phase, dayNumber, totalDays, urgentAnnouncement: urgentResult.data?.[0] ?? null,
  };
}
