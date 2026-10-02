import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProfileClient from './profile-client';
import BottomNav from '@/app/components/bottom-nav';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect('/login');

  const [{ data: profile, error }, { data: member, error: memberError }] = await Promise.all([supabase.from('profiles').select('full_name,email,avatar_url').eq('id', user.id).maybeSingle(), supabase.from('app_members').select('role').eq('user_id', user.id).maybeSingle()]);
  if (error || memberError) throw error ?? memberError;

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'Usuario';
  const email = profile?.email || user.email || '';

  return <main className='app panel-page profile-page'>
    <header className='subpage-top'>
      <Link href='/more' className='back-btn' aria-label='Volver'>‹</Link>
      <div><div className='eyebrow'>TU CUENTA</div><h1>Mi perfil</h1></div>
      <span className='polymet-sync'>☁ Sincronizado</span>
    </header>
    <ProfileClient userId={user.id} fullName={fullName} email={email} role={member?.role || 'viewer'} initialAvatarUrl={profile?.avatar_url || null}/>
    <BottomNav/>
  </main>;
}
