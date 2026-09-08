import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AnnouncementManager from "./announcement-manager";

export default async function AnnouncementsPage() {
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

  const { data: announcements, error } = camporee
    ? await supabase.from("announcements").select("id,title,message,priority,created_at,created_by").eq("camporee_id", camporee.id).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (error) throw error;

  return <main className="app panel-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">COMUNICACIÓN</div><h1>Avisos</h1></div><span className="avatar"><Megaphone size={22}/></span></header>
    <div className="panel-intro"><div><strong>{announcements?.length ?? 0} avisos</strong><small>Cambios de horario, llamados, emergencias y mensajes para todo el club.</small></div></div>
    {camporee ? <AnnouncementManager camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialAnnouncements={announcements ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
