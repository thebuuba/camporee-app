import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import ParticipantManager from "./participant-manager";

export default async function ParticipantsPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/participants');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('participants');

  const { data: participants, error: participantsError } = camporee
    ? await supabase.from("participants").select("id,full_name,participant_type,unit_name,phone,emergency_contact,emergency_phone,attendance_status,notes").eq("camporee_id", camporee.id).order("full_name")
    : { data: [], error: null };

  const contentError = participantsError;
  if (contentError) throw contentError;

  return <main className="app panel-page polymet-panel polymet-participants">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver"><ChevronLeft size={21}/></Link><div><h1>Participantes</h1><small>Participantes inscritos</small></div></header>

    {camporee ? <ParticipantManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} canEdit={canEdit} initialParticipants={participants ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
