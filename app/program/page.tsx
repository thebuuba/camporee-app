import { redirect } from "next/navigation";
import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "../components/bottom-nav";

export default async function ProgramPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: camporees } = await supabase.from("camporees").select("id,name,status").order("starts_on", { ascending: true });
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];
  const { data: events } = camporee ? await supabase.from("schedule_events").select("id,title,starts_at,ends_at,location").eq("camporee_id", camporee.id).order("starts_at", { ascending: true }) : { data: [] };
  return <main className="app"><header className="top"><div><div className="eyebrow">ORGANIZACIÓN</div><h1>Programa</h1></div><span className="avatar"><CalendarDays size={22}/></span></header><section className="section-card ios-card"><div className="section-head inside"><h3>Agenda del camporee</h3><span>{events?.length ?? 0} actividades</span></div>{events?.length ? events.map((event) => <article className="task" key={event.id}><span className="stat-icon stat-gold"><Clock3 size={18}/></span><div><b>{event.title}</b><small>{event.starts_at ? new Date(event.starts_at).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" }) : "Sin hora"}</small>{event.location ? <small><MapPin size={12}/> {event.location}</small> : null}</div></article>) : <div className="empty compact">Todavía no hay actividades en el programa.</div>}</section><BottomNav /></main>;
}
