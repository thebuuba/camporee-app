import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import OrganizationForm from '@/app/organizations/organization-form';

export default async function InvitationPage({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  if(!/^[a-f0-9]{64}$/.test(token))notFound();
  const supabase=await createClient();
  const auth=await supabase.auth.getUser();
  if(auth.error&&(auth.error.status??0)>=500)throw auth.error;
  if(!auth.data.user)redirect(`/login?next=${encodeURIComponent(`/invitations/${token}`)}`);
  return <main className="app panel-page organizations-page">
    <header className="polymet-panel-heading"><h1>Invitación a una organización</h1><p>Únete al equipo para organizar sus camporees.</p></header>
    <section className="organization-section ios-card"><p>Estás usando <strong>{auth.data.user.email}</strong>. El enlace debe estar dirigido a este correo y tu cuenta debe estar confirmada.</p><OrganizationForm kind="accept" submitLabel="Aceptar invitación"><input type="hidden" name="token" value={token}/></OrganizationForm></section>
    <p className="organization-personal-links"><Link href="/organizations">Volver a mis organizaciones</Link></p>
  </main>;
}
