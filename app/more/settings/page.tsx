import Link from '@/app/components/tenant-link';
import { Settings } from 'lucide-react';
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import NotificationControls from '@/app/components/notification-controls';
import SettingsForm from './settings-form';
import ThemeSettings from '@/app/components/theme-settings';
import NavigationSettings from './navigation-settings';

export default async function SettingsPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/settings');
  const { supabase, userId, camporee } = context;
  const canEdit = context.isAdmin;

  return <main className='app panel-page'>
    <header className='subpage-top'><Link href='/more' className='back-btn' aria-label='Volver'>‹</Link><div><div className='eyebrow'>CONFIGURACIÓN</div><h1>Ajustes</h1><p className='polymet-subtitle'>Camporee y notificaciones</p></div><span className='avatar'><Settings size={22}/></span></header>
    <div className='panel-intro'><div><strong>Datos generales del camporee</strong><small>Cambia el nombre, lugar, fechas y etapa del evento.</small></div></div>
    <ThemeSettings/>
    {camporee ? <>
      <SettingsForm key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporee={camporee} canEdit={canEdit}/>
      <NavigationSettings key={`navigation:${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} organizationId={context.organizationId} initialPanels={camporee.navigation_panels} canEdit={canEdit}/>
      <section className='polymet-settings-card polymet-notification-card'><h2>Notificaciones</h2><NotificationControls key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} userId={userId} mode='settings'/></section>
    </> : <div className='empty compact'>Todavía no hay un camporee activo.</div>}
  </main>;
}
