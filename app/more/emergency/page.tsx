import Link from 'next/link';
import { HeartPulse } from 'lucide-react';
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import EmergencyManager from './emergency-manager';

export default async function EmergencyPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/emergency');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('participants');
  const { data: contacts, error: contactsError } = camporee ? await supabase.from('emergency_contacts').select('*').eq('camporee_id', camporee.id).order('priority', { ascending: true }).order('created_at', { ascending: true }) : { data: [], error: null };

  const contentError = contactsError;
  if (contentError) throw contentError;

  return <main className='app panel-page'>
    <header className='subpage-top'><Link href='/more' className='back-btn' aria-label='Volver'>‹</Link><div><div className='eyebrow'>SEGURIDAD</div><h1>Emergencia</h1><p className='polymet-subtitle'>Contactos prioritarios</p></div><span className='avatar'><HeartPulse size={22}/></span></header>
    <div className='panel-intro'><div><strong>Contactos y protocolo</strong><small>Ten a mano los números y referencias importantes antes de salir.</small></div></div>
    {camporee ? <EmergencyManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} canEdit={canEdit} initialContacts={contacts ?? []}/> : <div className='empty compact'>Todavía no hay un camporee activo.</div>}
  </main>;
}
