import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import BottomNav from "../components/bottom-nav";
import ProgramManager from "./program-manager";
import {dateKeyInTimeZone} from '@/lib/date';

export default async function ProgramPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/program');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('schedule');

  const [{ data: events, error: eventsError }, { data: areas, error: areasError }] = camporee ? await Promise.all([
    supabase.from("schedule_events").select("id,title,description,starts_at,ends_at,location,responsible_name,area_id").eq("camporee_id", camporee.id).order("starts_at", { ascending: true }),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order", { ascending: true }),
  ]) : [{ data: [], error: null }, { data: [], error: null }];

  const contentError = eventsError ?? areasError;
  if (contentError) throw contentError;

  const now = new Date();
  const today = dateKeyInTimeZone(now,camporee.time_zone);
  const eventMode = Boolean(camporee.starts_on <= today && today <= camporee.ends_on);

  return <main className="app panel-page program-page">
    <header className="polymet-panel-heading"><h1>Programa</h1><p>{new Date().toLocaleDateString("es-DO",{weekday:"long",day:"numeric",month:"long",timeZone:camporee.time_zone})}</p></header>
    {camporee ? <ProgramManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} canEdit={canEdit} initialEvents={events ?? []} areas={areas ?? []} eventMode={eventMode} timeZone={camporee.time_zone}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
    <BottomNav />
  </main>;
}
