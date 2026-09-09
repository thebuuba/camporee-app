import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import NotificationControls from '@/app/components/notification-controls';
import SettingsForm from './settings-form';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect('/login');

  const [{ data: membership, error: membershipError }, { data: camporees, error: camporeesError }] = await Promise.all([
    supabase.from('app_members').select('role,is_active,permissions').eq('user_id', userId).maybeSingle(),
    supabase.from('camporees').select('id,name,location,starts_on,ends_on,status').order('starts_on', { ascending: true }),
  ]);
  if (membershipError || camporeesError) throw membershipError ?? camporeesError;
  if (!membership?.is_active) redirect('/');
  const camporee = camporees?.find((item) => item.status !== 'archived') ?? camporees?.[0];
  const canEdit = membership.role === 'admin';

  return <main className='app panel-page'>
    <header className='subpage-top'><Link href='/more' className='back-btn' aria-label='Volver'>‹</Link><div><div className='eyebrow'>CONFIGURACIÓN</div><h1>Ajustes</h1></div><span className='avatar'><Settings size={22}/></span></header>
    <div className='panel-intro'><div><strong>Datos generales del camporee</strong><small>Cambia el nombre, lugar, fechas y etapa del evento.</small></div></div>
    {camporee ? <>
      <div className='section-head'><h3>Notificaciones</h3><span>Este dispositivo</span></div>
      <NotificationControls camporeeId={camporee.id} userId={userId} mode='settings'/>
      <div className='section-head'><h3>Camporee</h3><span>Configuración general</span></div>
      <SettingsForm camporee={camporee} canEdit={canEdit}/>
    </> : <div className='empty compact'>Todavía no hay un camporee activo.</div>}
  </main>;
}
