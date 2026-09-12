import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import ProfileClient from './profile-client';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect('/login');

  const { data: profile, error } = await supabase.from('profiles').select('full_name,email,avatar_url').eq('id', user.id).maybeSingle();
  if (error) throw error;

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'Usuario';
  const email = profile?.email || user.email || '';

  return <main className='app panel-page profile-page'>
    <header className='subpage-top'>
      <Link href='/' className='back-btn' aria-label='Volver'>‹</Link>
      <div><div className='eyebrow'>TU CUENTA</div><h1>Perfil</h1></div>
      <span className='avatar'><UserRound size={21}/></span>
    </header>
    <ProfileClient userId={user.id} fullName={fullName} email={email} initialAvatarUrl={profile?.avatar_url || null}/>
  </main>;
}
