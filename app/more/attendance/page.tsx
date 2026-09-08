import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AttendanceManager from "./attendance-manager";

export default async function AttendancePage() {
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
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.participants);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];

  const [{ data: participants, error: participantsError }, { data: sessions, error: sessionsError }] = camporee ? await Promise.all([
    supabase.from("participants").select("id,full_name,unit_name,attendance_status").eq("camporee_id", camporee.id).neq("attendance_status", "cancelled").order("full_name"),
    supabase.from("attendance_sessions").select("id,title,session_type,occurred_at,created_at,attendance_marks(participant_id,present)").eq("camporee_id", camporee.id).order("occurred_at", { ascending: false }).limit(20),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const error = participantsError ?? sessionsError;
  if (error) throw error;

  return <main className="app panel-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">CONTROL</div><h1>Pases de lista</h1></div><span className="avatar"><ClipboardCheck size={22}/></span></header>
    <div className="panel-intro"><div><strong>{sessions?.length ?? 0} pases recientes</strong><small>Registra quién está presente en salidas, llegadas, cultos y actividades.</small></div></div>
    {camporee ? <AttendanceManager camporeeId={camporee.id} userId={userId} canEdit={canEdit} participants={participants ?? []} initialSessions={sessions ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
