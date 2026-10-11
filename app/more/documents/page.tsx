import Link from 'next/link';
import { FileText } from 'lucide-react';
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import DocumentManager from './document-manager';

export default async function DocumentsPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/documents');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('settings');
  const { data: allDocuments, error: documentsError } = camporee ? await supabase.from('camporee_documents').select('*').eq('camporee_id', camporee.id).order('created_at', { ascending: false }) : { data: [], error: null };
  const documents = allDocuments?.filter(item => !item.document_type?.startsWith('song:')) ?? [];

  const contentError = documentsError;
  if (contentError) throw contentError;

  return <main className='app panel-page'>
    <header className='subpage-top'><Link href='/more' className='back-btn' aria-label='Volver'>‹</Link><div><div className='eyebrow'>ARCHIVOS</div><h1>Documentos</h1><p className='polymet-subtitle'>{documents?.length ?? 0} archivos y enlaces</p></div><span className='avatar'><FileText size={22}/></span></header>
    <div className='panel-intro'><div><strong>Todo lo importante en un lugar</strong><small>Registra permisos, reglamentos, mapas, recibos y enlaces útiles.</small></div></div>
    {camporee ? <DocumentManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialDocuments={documents ?? []}/> : <div className='empty compact'>Todavía no hay un camporee activo.</div>}
  </main>;
}
