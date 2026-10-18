import Link from '@/app/components/tenant-link';
import { Trophy } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import ActivityManager from "./activity-manager";

export default async function ActivitiesPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/activities');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('schedule');

  const [{ data: activities, error: activitiesError }, { data: participants, error: participantsError }] = camporee ? await Promise.all([
    supabase.from("camporee_activities").select("id,title,activity_type,starts_at,location,responsible_name,materials,result,score,notes,schedule_event_id,is_completed,created_at,camporee_activity_participants(participant_id)").eq("camporee_id", camporee.id).order("starts_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
    supabase.from("participants").select("id,full_name,unit_name,attendance_status").eq("camporee_id", camporee.id).neq("attendance_status", "cancelled").order("full_name"),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const error = activitiesError ?? participantsError;
  if (error) throw error;

  return <main className="app panel-page polymet-detail-page polymet-activities">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><h1>Competencias</h1><small>{activities?.length ?? 0} competencias</small></div><span className="avatar"><Trophy size={22}/></span></header>
    <div className="panel-intro"><div><strong>{activities?.length ?? 0} actividades</strong><small>Competencias, especialidades, marcha, deportes y talentos del club.</small></div></div>
    {camporee ? <ActivityManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} canEdit={canEdit} initialActivities={activities ?? []} timeZone={camporee.time_zone} participants={participants ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
