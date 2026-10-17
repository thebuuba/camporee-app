import Link from '@/app/components/tenant-link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { isTenantId, tenantPath, type TenantIds } from '@/lib/tenant-context';
import { requireCamporeeContext } from '@/lib/tenant-server';
import ListDetailManager from './list-detail-manager';

type ListPageParams = Promise<Partial<TenantIds> & { listId: string }>;

export default async function ListDetailPage({ params, searchParams }: { params: ListPageParams; searchParams?: Promise<{ from?: string }> }) {
  const ids = await params;
  if (!isTenantId(ids.listId)) notFound();
  const context = await requireCamporeeContext(params, '/more/lists/' + ids.listId);
  const { supabase, camporee } = context;

  // Resolve this list inside the authenticated camporee before requesting its items.
  // One scoped request instead of two sequential database roundtrips.
  const { data: list, error: listError } = await supabase.from('lists')
    .select('id,title,category,list_items(id,label,quantity,unit,is_done,notes,sort_order)')
    .eq('camporee_id', camporee.id).eq('id', ids.listId).maybeSingle();
  if (listError) throw listError;
  if (!list) notFound();
  const items = [...(list.list_items ?? [])].sort(
    (a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
  );

  const fromHome = (await searchParams)?.from === 'home';
  const backHref = tenantPath(context, fromHome ? '/more/lists?from=home' : '/more/lists');
  return <main key={list.id} className="app panel-page polymet-panel polymet-list-detail-page">
    <header className="subpage-top">
      <Link href="/more/lists" className="back-btn" aria-label="Volver a listas"><ChevronLeft size={21} /></Link>
      <div><h1>{list.title}</h1><small>{list.category || 'Lista'} · Compras, equipaje y materiales</small></div>
    </header>
    <ListDetailManager key={context.userId + ':' + list.id} camporeeId={camporee.id}
      listId={list.id} canEdit={context.canEdit('lists')} initialItems={items} backHref={backHref} />
  </main>;
}
