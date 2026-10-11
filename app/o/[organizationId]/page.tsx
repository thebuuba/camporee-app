import Link from 'next/link';
import {CalendarDays,ChevronRight} from 'lucide-react';
import {requireOrganizationContext} from '@/lib/tenant-server';
import {tenantPath} from '@/lib/tenant-context';
import OrganizationForm from '@/app/organizations/organization-form';

const labels={planning:'En preparación',active:'En curso',finished:'Finalizado',archived:'Archivado'} as Record<string,string>;
export default async function OrganizationPage({params}:{params:Promise<{organizationId:string}>}) {
  const {organizationId}=await params;
  const context=await requireOrganizationContext(organizationId);
  const result=await context.supabase.from('camporees').select('id,name,starts_on,ends_on,status').eq('organization_id',organizationId).order('starts_on',{ascending:false});
  if(result.error)throw new Error('No se pudieron cargar los camporees de esta organización.');
  return <main className="app panel-page organizations-page">
    <header className="subpage-top"><Link href="/organizations" className="back-btn" aria-label="Volver a mis organizaciones">‹</Link><div><h1>{context.organization.name}</h1><p>Camporees e historial</p></div></header>
    <div className="organization-list">{(result.data??[]).map(camporee=><Link className="organization-card ios-card" href={tenantPath({organizationId,camporeeId:camporee.id})} key={camporee.id}><CalendarDays size={24} aria-hidden="true"/><span><strong>{camporee.name}</strong><small>{labels[camporee.status]} · {camporee.starts_on} — {camporee.ends_on}</small></span><ChevronRight size={20} aria-hidden="true"/></Link>)}</div>
    {!result.data?.length?<p className="empty compact">Esta organización todavía no tiene camporees.{context.isAdmin?' Crea el primero para empezar.':' Un administrador puede crear el primero.'}</p>:null}
    {context.isAdmin?<>
      <p className="organization-personal-links"><Link href={`/o/${organizationId}/members`}>Miembros, invitaciones y permisos</Link></p>
      <details className="organization-section ios-card"><summary>Crear un camporee</summary><OrganizationForm kind="create-camporee" submitLabel="Crear camporee">
        <input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="requestId" value={crypto.randomUUID()}/>
        <label>Nombre<input name="name" required minLength={2} maxLength={120}/></label>
        <label>Lema<input name="theme"/></label><label>Lugar<input name="location"/></label>
        <label>Fecha de inicio<input type="date" name="startsOn" required/></label><label>Fecha final<input type="date" name="endsOn" required/></label>
        <label>Moneda<select name="currency" defaultValue="DOP"><option value="DOP">Peso dominicano (DOP)</option><option value="BOB">Boliviano (BOB)</option><option value="USD">Dólar estadounidense (USD)</option><option value="EUR">Euro (EUR)</option></select></label>
        <label>Zona horaria<select name="timeZone" defaultValue="America/Santo_Domingo"><option value="America/Santo_Domingo">Santo Domingo</option><option value="America/La_Paz">La Paz</option><option value="America/Bogota">Bogotá</option><option value="America/Mexico_City">Ciudad de México</option><option value="UTC">UTC</option></select></label>
      </OrganizationForm></details>
    </>:null}
  </main>;
}
