import Link from 'next/link';
import {redirect} from 'next/navigation';
import {Building2,ChevronRight} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import OrganizationForm from './organization-form';

export default async function OrganizationsPage() {
  const supabase=await createClient();
  const auth=await supabase.auth.getUser();
  if(auth.error&&(auth.error.status??0)>=500)throw auth.error;
  if(!auth.data.user)redirect('/login?next=%2Forganizations');
  const [orgs,members]=await Promise.all([
    supabase.from('organizations').select('id,name').order('name'),
    supabase.from('organization_members').select('organization_id,role,is_active,permissions').eq('user_id',auth.data.user.id),
  ]);
  if(orgs.error||members.error)throw new Error('No se pudieron cargar tus organizaciones. Inténtalo de nuevo.');
  const roles=new Map((members.data??[]).filter(member=>member.is_active).map(member=>[member.organization_id,member.role]));
  const pending=(members.data??[]).filter(member=>!member.is_active&&member.permissions?.access_rejected!==true).length;
  return <main className="app panel-page organizations-page">
    <header className="polymet-panel-heading"><h1>Mis organizaciones</h1><p>Elige el club con el que vas a trabajar.</p></header>
    <div className="organization-list">{(orgs.data??[]).map(org=><Link className="organization-card ios-card" href={`/o/${org.id}`} key={org.id}><Building2 size={24} aria-hidden="true"/><span><strong>{org.name}</strong><small>{roles.get(org.id)==='admin'?'Administrador':roles.get(org.id)==='editor'?'Editor':'Solo lectura'}</small></span><ChevronRight size={20} aria-hidden="true"/></Link>)}</div>
    {!(orgs.data??[]).length?<p className="empty compact">Todavía no perteneces a una organización activa. Puedes crear una o abrir el enlace de invitación de tu club.</p>:null}
    {pending?<p className="auth-alert" role="status">Tienes {pending} membresía{pending===1?'':'s'} pendiente{pending===1?'':'s'} de aprobación.</p>:null}
    <details className="organization-section ios-card"><summary>Crear una organización</summary><p>Tu cuenta será administradora de esta organización. Podrás invitar al equipo y crear sus camporees.</p><OrganizationForm kind="create-organization" submitLabel="Crear organización"><input type="hidden" name="requestId" value={crypto.randomUUID()}/><label>Nombre del club u organización<input name="name" minLength={2} maxLength={120} required autoComplete="organization"/></label></OrganizationForm></details>
    <p className="organization-personal-links"><Link href="/profile">Mi perfil</Link></p>
    <form action="/auth/signout" method="post"><button type="submit" className="text-btn">Cerrar sesión</button></form>
  </main>;
}
