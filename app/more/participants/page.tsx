import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ParticipantManager from "./participant-manager";

export default async function ParticipantsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: membership }, { data: camporees }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,status").order("starts_on", { ascending: true }),
  ]);
  if (!membership?.is_active) redirect("/login");

  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.participants);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];

  const { data: participants } = camporee
    ? await supabase.from("participants").select("id,full_name,participant_type,unit_name,phone,emergency_contact,emergency_phone,attendance_status,notes").eq("camporee_id", camporee.id).order("full_name")
    : { data: [] };

  return <main className="app panel-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">ORGANIZACIÓN</div><h1>Participantes</h1></div><span className="avatar"><Users size={22}/></span></header>
    <div className="panel-intro"><div><strong>{participants?.length ?? 0} personas</strong><small>Miembros, dirigentes, acompañantes y contactos.</small></div></div>
    {camporee ? <ParticipantManager camporeeId={camporee.id} canEdit={canEdit} initialParticipants={participants ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
