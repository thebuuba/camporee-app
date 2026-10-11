import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

// The invitation URL carries a secret token, separate from the four-digit
// manual code. A verified user is enrolled automatically on landing here.
export default async function JoinCamporeePage({params}:{params:Promise<{code:string}>}) {
  const token=(await params).code.toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(token))notFound();
  const destination=`/join/${token}`;
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getUser();
  if(error&&(error.status??0)>=500)throw error;
  if(!data.user){
    return <main className="app panel-page organizations-page">
      <section className="organization-section ios-card">
        <h1>Te invitaron a un camporee</h1>
        <p>Al registrarte o iniciar sesión quedarás vinculado automáticamente. No necesitas escribir ningún código.</p>
        <Link className="primary-btn" href={`/signup?next=${encodeURIComponent(destination)}`}>Crear cuenta y unirme</Link>
        <p>¿Ya tienes cuenta? <Link href={`/login?next=${encodeURIComponent(destination)}`}>Iniciar sesión</Link></p>
      </section>
    </main>;
  }
  // The RPC enforces confirmed email, active camporee, one club per account,
  // and a high-entropy token. It is safe to retry after an interrupted redirect.
  const {error:joinError}=await supabase.rpc('join_camporee_by_token',{invite_token:token});
  if(!joinError)redirect('/');
  const message=joinError.code==='23505'
    ?'Tu cuenta ya pertenece a otro club. No puedes unirte a dos clubes.'
    :joinError.code==='42501'
      ?'Debes confirmar tu correo, o el director debe resolver una solicitud de acceso pendiente.'
      :'Este enlace de invitación no está disponible o ha dejado de ser válido.';
  return <main className="app panel-page organizations-page">
    <section className="organization-section ios-card">
      <h1>No pudimos completar la invitación</h1>
      <p role="alert">{message}</p>
      <Link href="/organizations" className="primary-btn">Ir a mi cuenta</Link>
    </section>
  </main>;
}
