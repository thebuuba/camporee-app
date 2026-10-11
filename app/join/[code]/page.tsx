import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import OrganizationForm from '@/app/organizations/organization-form';

export default async function JoinCamporeePage({params}:{params:Promise<{code:string}>}) {
  const raw=(await params).code;
  const code=raw.replace(/[^a-fA-F0-9]/g,'').toUpperCase();
  if(!/^[A-F0-9]{16}$/.test(code))notFound();
  const destination=`/join/${code}`;
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getUser();
  if(error&&(error.status??0)>=500)throw error;
  if(!data.user) {
    return <main className="app panel-page organizations-page">
      <section className="organization-section ios-card">
        <h1>Te invitaron a un camporee</h1>
        <p>El director compartió contigo un enlace de invitación. No necesitas escribir ningún código.</p>
        <Link className="primary-btn" href={`/signup?next=${encodeURIComponent(destination)}`}>Crear mi cuenta y unirme</Link>
        <p>¿Ya tienes cuenta? <Link href={`/login?next=${encodeURIComponent(destination)}`}>Iniciar sesión</Link></p>
      </section>
    </main>;
  }
  const {data:member,error:memberError}=await supabase.from('organization_members')
    .select('organization_id,is_active').eq('user_id',data.user.id).maybeSingle();
  if(memberError)throw memberError;
  if(member?.is_active)redirect('/');

  return <main className="app panel-page organizations-page">
    <section className="organization-section ios-card">
      <h1>Unirme al camporee</h1>
      <p>Estás entrando con {data.user.email}. La invitación ya incluye el código; solo tienes que confirmar.</p>
      <OrganizationForm kind="join" submitLabel="Unirme a mi camporee">
        <input type="hidden" name="code" value={code}/>
      </OrganizationForm>
    </section>
  </main>;
}
