import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {isTenantSchemaUnavailable} from '@/lib/tenant-schema';
import OrganizationForm from './organization-form';
import SafeSignoutForm from '@/app/components/safe-signout-form';

// First registration: create your club or join the one your director created.
// Members never choose from a list of clubs or camporees.
export default async function OrganizationsPage() {
  const supabase=await createClient();
  const auth=await supabase.auth.getUser();
  if(auth.error&&(auth.error.status??0)>=500)throw auth.error;
  if(!auth.data.user)redirect('/login?next=%2Forganizations');
  const result=await supabase.from('organization_members')
    .select('organization_id,is_active,permissions').eq('user_id',auth.data.user.id).maybeSingle();
  if(isTenantSchemaUnavailable(result.error))redirect('/setup-required');
  if(result.error)throw result.error;
  if(result.data?.is_active)redirect(`/o/${result.data.organization_id}`);
  const pending=result.data && !result.data.is_active;

  return <main className="app panel-page organizations-page">
    <header className="polymet-panel-heading">
      <h1>{pending?'Tu solicitud está pendiente':'Bienvenido a Camporee App'}</h1>
      <p>{pending?'Tu director debe aprobar tu acceso antes de entrar.':'Para comenzar, crea el camporee de tu club o únete al que organizó tu director.'}</p>
    </header>
    {pending?<section className="organization-section ios-card">
      <p>{result.data?.permissions?.access_rejected===true?'El director rechazó tu solicitud. Contacta con él para resolverlo.':'Ya recibimos tu solicitud de acceso. Cuando tu director la apruebe, podrás entrar automáticamente.'}</p>
      <SafeSignoutForm><button className="secondary-btn" type="submit">Cerrar sesión</button></SafeSignoutForm>
    </section>:<>
      <section className="organization-section ios-card">
        <h2>Unirme a mi camporee</h2>
        <p>Introduce el código de cuatro dígitos para solicitar acceso al director. Si recibiste un enlace, ábrelo para unirte directamente sin escribir el código.</p>
        <OrganizationForm kind="join" submitLabel="Entrar al camporee">
          <label>Código de invitación<input name="code" placeholder="Ej.: 4827" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required/></label>
        </OrganizationForm>
      </section>
      <section className="organization-section ios-card">
        <h2>Soy director y crearé el camporee</h2>
        <p>Crea el espacio de tu club. A continuación registrarás el camporee y compartirás un código para invitar al equipo.</p>
        <OrganizationForm kind="create-organization" submitLabel="Crear mi club">
          <input type="hidden" name="requestId" value={crypto.randomUUID()}/>
          <label>Nombre del club<input name="name" minLength={2} maxLength={120} required autoComplete="organization"/></label>
        </OrganizationForm>
      </section>
      <p className="organization-personal-links"><Link href="/profile">Mi perfil</Link></p>
      <SafeSignoutForm><button className="secondary-btn" type="submit">Cerrar sesión</button></SafeSignoutForm>
    </>}
  </main>;
}
