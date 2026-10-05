import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Music2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { songsFromDocuments } from '@/lib/songs';
import SongsManager from './songs-manager';

export default async function SongsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect('/login');
  const [{ data: membership, error: membershipError }, { data: camporees, error: camporeesError }] = await Promise.all([
    supabase.from('app_members').select('role,is_active,permissions').eq('user_id', userId).maybeSingle(),
    supabase.from('camporees').select('id,status').order('starts_on', { ascending: true }),
  ]);
  if (membershipError || camporeesError) throw membershipError ?? camporeesError;
  if (!membership?.is_active) redirect('/');
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === 'admin' || membership.role === 'editor' || Boolean(permissions.settings || permissions.edit);
  const camporee = camporees?.find(item => item.status !== 'archived') ?? camporees?.[0];
  const { data: documents, error } = camporee ? await supabase.from('camporee_documents').select('id,title,document_type,notes,external_url,file_path').eq('camporee_id', camporee.id).like('document_type', 'song:%').order('created_at') : { data: [], error: null };
  if (error) throw error;
  return <main className="app panel-page songs-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver a Más">‹</Link><div><div className="eyebrow">CANCIONERO</div><h1>Canciones del club</h1><p className="polymet-subtitle">Para cantar juntos</p></div><span className="avatar"><Music2 size={22} aria-hidden="true"/></span></header>
    <p className="song-offline-note">Abre aquí con internet para guardar una copia de las letras. Usa «Descargar en la app» para escuchar sin internet desde Descargadas. Los enlaces externos necesitan conexión.</p>
    {camporee ? <SongsManager camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialSongs={songsFromDocuments(documents ?? [])}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
