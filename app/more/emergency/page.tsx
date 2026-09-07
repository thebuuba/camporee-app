import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeartPulse } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import EmergencyManager from './emergency-manager';

export default async function EmergencyPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect('/login');

  const [{ data: membership }, { data: camporees }] = await Promise.all([
    supabase.from('app_members').select('role,is_active,permissions').eq('user_id', userId).maybeSingle(),
    supabase.from('camporees').select('id,status').order('starts_on', { ascending: true }),
  ]);
  if (!membership?.is_active) redirect('/login');
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === 'admin' || membership.role === 'editor' || Boolean(permissions.participants);
  const camporee = camporees?.find((item) => item.status !== 'archived') ?? camporees?.[0];
  const { data: contacts } = camporee ? await supabase.from('emergency_contacts').select('*').eq('camporee_id', camporee.id).order('priority', { ascending: true }).order('created_at', { ascending: true }) : { data: [] };

  return <main className='app panel-page'>
    <header className='subpage-top'><Link href='/more' className='back-btn' aria-label='Volver'>‹</Link><div><div className='eyebrow'>SEGURIDAD</div><h1>Emergencia</h1></div><span className='avatar'><HeartPulse size={22}/></span></header>
    <div className='panel-intro'><div><strong>Contactos y protocolo</strong><small>Ten a mano los números y referencias importantes antes de salir.</small></div></div>
    {camporee ? <EmergencyManager camporeeId={camporee.id} canEdit={canEdit} initialContacts={contacts ?? []}/> : <div className='empty compact'>Todavía no hay un camporee activo.</div>}
  </main>;
}
