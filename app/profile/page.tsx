import Link from 'next/link';
import SyncStatus from '@/app/components/sync-status';
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

  const [{ data: profile, error }, { data: membership, error: memberError }] = await Promise.all([
    supabase.from('profiles').select('full_name,email,avatar_path').eq('id', user.id).maybeSingle(),
    supabase.from('organization_members').select('organization_id,role,is_active').eq('user_id', user.id).maybeSingle(),
  ]);
  const [{data:organization,error:organizationError},{data:camporee,error:camporeeError}]=membership?.is_active
    ?await Promise.all([
      supabase.from('organizations').select('name').eq('id',membership.organization_id).maybeSingle(),
      supabase.from('camporees').select('navigation_panels').eq('organization_id',membership.organization_id).neq('status','archived').maybeSingle(),
    ])
    :[{data:null,error:null},{data:null,error:null}];
  if (error || memberError) throw error ?? memberError;
  if(organizationError)throw organizationError;
  if(camporeeError)throw camporeeError;
  const avatarUrl=await signedAvatar(supabase,{...profile,id:user.id});

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'Usuario';
  const email = profile?.email || user.email || '';

  return <main className='app panel-page profile-page'>
    <header className='subpage-top'>
      <Link href='/' className='back-btn' aria-label='Volver al camporee'>‹</Link>
      <div><div className='eyebrow'>TU CUENTA</div><h1>Mi perfil</h1></div>
      <SyncStatus/>
    </header>
    <ProfileClient key={user.id} userId={user.id} fullName={fullName} email={email} initialAvatarUrl={avatarUrl} initialAvatarPath={profile?.avatar_path??null}/>
    {membership?<section className="organization-section ios-card"><h2>Mi club</h2><p><strong>{organization?.name??'Club'}</strong> · {!membership.is_active?'Sin acceso activo':membership.role==='admin'?'Director / Administrador':membership.role==='editor'?'Editor':'Miembro'}</p></section>:null}
    <BottomNav panels={camporee?.navigation_panels}/>
  </main>;
}
