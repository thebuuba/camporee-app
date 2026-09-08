import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "../components/bottom-nav";
import ProgramManager from "./program-manager";

export default async function ProgramPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: membership, error: membershipError }, { data: camporees, error: camporeesError }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,name,status").order("starts_on", { ascending: true }),
  ]);
  if (membershipError || camporeesError) throw membershipError ?? camporeesError;
  if (!membership?.is_active) redirect("/");
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.schedule);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];

  const [{ data: events, error: eventsError }, { data: areas, error: areasError }] = camporee ? await Promise.all([
    supabase.from("schedule_events").select("id,title,description,starts_at,ends_at,location,responsible_name,area_id").eq("camporee_id", camporee.id).order("starts_at", { ascending: true }),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order", { ascending: true }),
  ]) : [{ data: [], error: null }, { data: [], error: null }];

  const contentError = eventsError ?? areasError;
  if (contentError) throw contentError;

  return <main className="app panel-page program-page">
    <header className="top top-icon-only compact-panel-top"><span className="avatar"><CalendarDays size={22}/></span></header>
    {camporee ? <ProgramManager camporeeId={camporee.id} canEdit={canEdit} initialEvents={events ?? []} areas={areas ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
    <BottomNav />
  </main>;
}
