import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import AttendanceManager from "./attendance-manager";

export default async function AttendancePage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/attendance');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('participants');

  const [{ data: participants, error: participantsError }, { data: sessions, error: sessionsError }] = camporee ? await Promise.all([
    supabase.from("participants").select("id,full_name,unit_name,attendance_status").eq("camporee_id", camporee.id).neq("attendance_status", "cancelled").order("full_name"),
    supabase.from("attendance_sessions").select("id,title,session_type,occurred_at,created_at,attendance_marks(participant_id,present)").eq("camporee_id", camporee.id).order("occurred_at", { ascending: false }).limit(20),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const error = participantsError ?? sessionsError;
  if (error) throw error;

  return <main className="app panel-page polymet-detail-page polymet-attendance">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><h1>Pases de lista</h1><small>{participants?.length ?? 0} personas esperadas</small></div><span className="avatar"><ClipboardCheck size={22}/></span></header>
    <div className="panel-intro"><div><strong>{sessions?.length ?? 0} pases recientes</strong><small>Registra quién está presente en salidas, llegadas, cultos y actividades.</small></div></div>
    {camporee ? <AttendanceManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} userId={userId} canEdit={canEdit} participants={participants ?? []} initialSessions={sessions ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
