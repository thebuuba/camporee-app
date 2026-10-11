import Link from 'next/link';
import {CalendarDays} from 'lucide-react';
import {redirect} from 'next/navigation';
import {requireOrganizationContext} from '@/lib/tenant-server';
import OrganizationForm from '@/app/organizations/organization-form';

export default async function OrganizationPage({params}:{params:Promise<{organizationId:string}>}) {
  const {organizationId}=await params;
  const context=await requireOrganizationContext(organizationId);
  const result=await context.supabase.from('camporees').select('id,name,starts_on,ends_on,status').eq('organization_id',organizationId).neq('status','archived').maybeSingle();
  if(result.error)throw result.error;
  if(result.data)redirect(`/o/${organizationId}/c/${result.data.id}`);
  return <main className="app panel-page organizations-page">
    <header className="polymet-panel-heading"><h1>{context.organization.name}</h1><p>{context.isAdmin?'Vamos a crear el camporee de tu club.':'El director todavía no ha creado el camporee.'}</p></header>
    {context.isAdmin?<section className="organization-section ios-card">
      <h2>Crear mi camporee</h2>
      <OrganizationForm kind="create-camporee" submitLabel="Crear camporee">
        <input type="hidden" name="organizationId" value={organizationId}/>
        <input type="hidden" name="requestId" value={crypto.randomUUID()}/>
        <label>Nombre del camporee<input name="name" required minLength={2} maxLength={120}/></label>
        <label>Lugar<input name="location"/></label>
        <label>Fecha de inicio<input type="date" name="startsOn" required/></label>
        <label>Fecha final<input type="date" name="endsOn" required/></label>
        <label>Moneda<select name="currency" defaultValue="DOP"><option value="DOP">Peso dominicano (DOP)</option><option value="USD">Dólar estadounidense (USD)</option><option value="EUR">Euro (EUR)</option><option value="BOB">Boliviano (BOB)</option></select></label>
        <label>Zona horaria<select name="timeZone" defaultValue="America/Santo_Domingo"><option value="America/Santo_Domingo">Santo Domingo</option><option value="America/La_Paz">La Paz</option><option value="America/Bogota">Bogotá</option><option value="America/Mexico_City">Ciudad de México</option></select></label>
      </OrganizationForm>
      <p><Link href={`/o/${organizationId}/members`}>Administrar miembros</Link></p>
    </section>:<section className="organization-section ios-card"><CalendarDays size={24}/><p>Cuando el director cree el camporee, aparecerá aquí automáticamente.</p></section>}
  </main>;
}
