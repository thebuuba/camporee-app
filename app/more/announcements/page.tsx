import Link from '@/app/components/tenant-link';
import { Megaphone } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import AnnouncementManager from "./announcement-manager";

export default async function AnnouncementsPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/announcements');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('schedule');

  const { data: announcements, error } = camporee
    ? await supabase.from("announcements").select("id,title,message,priority,created_at,created_by").eq("camporee_id", camporee.id).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (error) throw error;
  const {data: scheduled,error: scheduleError}=canEdit&&camporee
    ? await supabase.from('scheduled_announcements').select('id,title,message,priority,publish_at').eq('camporee_id',camporee.id).order('publish_at')
    : {data:[],error:null};
  if(scheduleError)throw scheduleError;

  return <main className="app panel-page polymet-detail-page polymet-announcements">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><h1>Avisos</h1><small>{announcements?.length ?? 0} mensajes</small></div><span className="avatar"><Megaphone size={22}/></span></header>
    <div className="panel-intro"><div><strong>{announcements?.length ?? 0} avisos</strong><small>Cambios de horario, llamados, emergencias y mensajes para todo el club.</small></div></div>
    {camporee ? <AnnouncementManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialAnnouncements={announcements ?? []} initialScheduled={scheduled??[]}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
