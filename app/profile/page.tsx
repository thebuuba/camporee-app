import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProfileClient from './profile-client';
import BottomNav from '@/app/components/bottom-nav';
import {signedAvatar} from '@/lib/avatars';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth, error:authError } = await supabase.auth.getUser();
  if(authError&&(authError.status??0)>=500)throw authError;
  const user = auth.user;
  if (!user) redirect('/login');

  const [{ data: profile, error }, { data: memberships, error: memberError },{data:organizations,error:organizationError}] = await Promise.all([supabase.from('profiles').select('full_name,email,avatar_path').eq('id', user.id).maybeSingle(), supabase.from('organization_members').select('organization_id,role,is_active').eq('user_id', user.id),supabase.from('organizations').select('id,name')]);
  if (error || memberError) throw error ?? memberError;
  if(organizationError)throw organizationError;
  const avatarUrl=await signedAvatar(supabase,{...profile,id:user.id});

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'Usuario';
  const email = profile?.email || user.email || '';

  return <main className='app panel-page profile-page'>
    <header className='subpage-top'>
      <Link href='/organizations' className='back-btn' aria-label='Volver a organizaciones'>‹</Link>
      <div><div className='eyebrow'>TU CUENTA</div><h1>Mi perfil</h1></div>
      <span className='polymet-sync'>☁ Sincronizado</span>
    </header>
    <ProfileClient key={user.id} userId={user.id} fullName={fullName} email={email} initialAvatarUrl={avatarUrl} initialAvatarPath={profile?.avatar_path??null}/>
    <section className="organization-list"><h2>Mis organizaciones</h2>{(memberships??[]).map(member=><Link key={member.organization_id} href={`/o/${member.organization_id}`} className="ios-card"><strong>{organizations?.find(org=>org.id===member.organization_id)?.name??'Organización'}</strong><span>{!member.is_active?'Sin acceso activo':member.role==='admin'?'Administrador':member.role==='editor'?'Editor':'Solo lectura'}</span></Link>)}</section>
    <BottomNav/>
  </main>;
}
