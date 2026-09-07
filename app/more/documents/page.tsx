import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import DocumentManager from './document-manager';

export default async function DocumentsPage() {
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
  const canEdit = membership.role === 'admin' || membership.role === 'editor' || Boolean(permissions.settings);
  const camporee = camporees?.find((item) => item.status !== 'archived') ?? camporees?.[0];
  const { data: documents, error: documentsError } = camporee ? await supabase.from('camporee_documents').select('*').eq('camporee_id', camporee.id).order('created_at', { ascending: false }) : { data: [], error: null };

  const contentError = documentsError;
  if (contentError) throw contentError;

  return <main className='app panel-page'>
    <header className='subpage-top'><Link href='/more' className='back-btn' aria-label='Volver'>‹</Link><div><div className='eyebrow'>ARCHIVOS</div><h1>Documentos</h1></div><span className='avatar'><FileText size={22}/></span></header>
    <div className='panel-intro'><div><strong>Todo lo importante en un lugar</strong><small>Registra permisos, reglamentos, mapas, recibos y enlaces útiles.</small></div></div>
    {camporee ? <DocumentManager camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialDocuments={documents ?? []}/> : <div className='empty compact'>Todavía no hay un camporee activo.</div>}
  </main>;
}
