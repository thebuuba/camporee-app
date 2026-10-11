import Link from '@/app/components/tenant-link';
import { Music2 } from 'lucide-react';
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import { songsFromDocuments } from '@/lib/songs';
import SongsManager from './songs-manager';

export default async function SongsPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/songs');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('settings');
  const { data: documents, error } = camporee ? await supabase.from('camporee_documents').select('id,title,document_type,notes,external_url,file_path').eq('camporee_id', camporee.id).like('document_type', 'song:%').order('created_at') : { data: [], error: null };
  if (error) throw error;
  return <main className="app panel-page songs-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver a Más">‹</Link><div><div className="eyebrow">CANCIONERO</div><h1>Canciones del club</h1><p className="polymet-subtitle">Para cantar juntos</p></div><span className="avatar"><Music2 size={22} aria-hidden="true"/></span></header>
    <p className="song-offline-note">Abre aquí con internet para guardar una copia de las letras. Usa «Descargar en la app» para escuchar sin internet desde Descargadas. Los enlaces externos necesitan conexión.</p>
    {camporee ? <SongsManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialSongs={songsFromDocuments(documents ?? [])}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}
  </main>;
}
