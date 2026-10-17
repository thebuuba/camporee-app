import Link from '@/app/components/tenant-link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { isTenantId, tenantPath, type TenantIds } from '@/lib/tenant-context';
import { requireCamporeeContext } from '@/lib/tenant-server';
import ListDetailManager from './list-detail-manager';

type ListPageParams = Promise<Partial<TenantIds> & { listId: string }>;

export default async function ListDetailPage({ params }: { params: ListPageParams }) {
  const ids = await params;
  if (!isTenantId(ids.listId)) notFound();
  const context = await requireCamporeeContext(params, '/more/lists/' + ids.listId);
  const { supabase, camporee } = context;

  // Resolve this list inside the authenticated camporee before requesting its items.
  const { data: list, error: listError } = await supabase.from('lists')
    .select('id,title,category')
    .eq('camporee_id', camporee.id).eq('id', ids.listId).maybeSingle();
  if (listError) throw listError;
  if (!list) notFound();

  const { data: items, error: itemsError } = await supabase.from('list_items')
    .select('id,label,quantity,unit,is_done,notes,sort_order')
    .eq('list_id', list.id).order('sort_order', { ascending: true });
  if (itemsError) throw itemsError;

  const backHref = tenantPath(context, '/more/lists');
  return <main className="app panel-page polymet-panel polymet-list-detail-page">
    <header className="subpage-top">
      <Link href="/more/lists" className="back-btn" aria-label="Volver a listas"><ChevronLeft size={21} /></Link>
      <div><h1>{list.title}</h1><small>{list.category || 'Lista'} · Compras, equipaje y materiales</small></div>
    </header>
    <ListDetailManager key={context.userId + ':' + list.id} camporeeId={camporee.id}
      listId={list.id} canEdit={context.canEdit('lists')} initialItems={items ?? []} backHref={backHref} />
  </main>;
}
