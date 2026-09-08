import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ActivityManager from "./activity-manager";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: membership, error: membershipError }, { data: camporees, error: camporeesError }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,status").order("starts_on", { ascending: true }),
  ]);
  if (membershipError || camporeesError) throw membershipError ?? camporeesError;
  if (!membership?.is_active) redirect("/");

  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.schedule);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];

  const [{ data: activities, error: activitiesError }, { data: participants, error: participantsError }] = camporee ? await Promise.all([
    supabase.from("camporee_activities").select("id,title,activity_type,starts_at,location,responsible_name,materials,result,score,notes,camporee_activity_participants(participant_id)").eq("camporee_id", camporee.id).order("starts_at", { ascending: true, nullsFirst: false }),
    supabase.from("participants").select("id,full_name,unit_name,attendance_status").eq("camporee_id", camporee.id).neq("attendance_status", "cancelled").order("full_name"),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const error = activitiesError ?? participantsError;
  if (error) throw error;

  return <main className="app panel-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">PARTICIPACIÓN</div><h1>Competencias</h1></div><span className="avatar"><Trophy size={22}/></span></header>
    <div className="panel-intro"><div><strong>{activities?.length ?? 0} actividades</strong><small>Competencias, especialidades, marcha, deportes y talentos del club.</small></div></div>
    {camporee ? <ActivityManager camporeeId={camporee.id} canEdit={canEdit} initialActivities={activities ?? []} participants={participants ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
