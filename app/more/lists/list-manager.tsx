'use client';

import BottomSheet from '@/app/components/bottom-sheet';
import Link from '@/app/components/tenant-link';
import { useLinkStatus } from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Backpack, ChevronRight, Hammer, ListChecks, LoaderCircle, Plus, ShoppingCart, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

type ListItem = { id: string; label: string; is_done: boolean };
type ListRow = { id: string; title: string; category: string | null; list_items: ListItem[] };

// Follow the real Next.js transition without arbitrary timers or a stuck busy state.
function ListCardStatus() {
  const { pending } = useLinkStatus();
  return <span className={'pm-list-card-status' + (pending ? ' is-opening' : '')}
    role={pending ? 'status' : undefined} aria-label={pending ? 'Abriendo lista' : undefined}>
    {pending ? <LoaderCircle size={18} className="pm-list-link-spinner" aria-hidden="true" />
      : <ChevronRight size={16} aria-hidden="true" />}
  </span>;
}

export default function ListManager({ camporeeId, canEdit, initialLists }: {
  camporeeId: string; canEdit: boolean; initialLists: ListRow[];
}) {
  const [lists, setLists] = useState(initialLists);
  const [creating, setCreating] = useState(false);
  const [openList, setOpenList] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setLists(initialLists); }, [initialLists]);

  const visibleLists = useMemo(() => lists.filter((list) => {
    const haystack = [list.title, list.category || '', ...(list.list_items || []).map(item => item.label)].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase().trim()) && (category === 'all' || list.category?.toLowerCase() === category);
  }), [lists, query, category]);
  const categories = useMemo(() => [...new Set(lists.map(list => list.category?.toLowerCase()).filter((value): value is string => Boolean(value)))], [lists]);
  const categoryIcon = (value: string | null) => value?.includes('compra') || value === 'food-shopping'
    ? <ShoppingCart size={20} /> : value?.includes('equipaje') ? <Backpack size={20} /> : value?.includes('material') ? <Hammer size={20} /> : <ListChecks size={20} />;

  async function addList(formData: FormData) {
    if (!canEdit || creating) return;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.from('lists')
        .insert({ camporee_id: camporeeId, title, category: String(formData.get('category') || '').trim() || null })
        .select('id,title,category').single();
      if (error || !data) { reportMutationError(error, 'No se pudo crear la lista.'); return; }
      setLists(current => [...current, { ...data, list_items: [] }]);
      setOpenList(false);
      reportMutationSuccess('Lista creada.');
      router.refresh();
    } catch (error) {
      reportMutationError(error, 'No se pudo crear la lista.');
    } finally {
      setCreating(false);
    }
  }

  return <>
    <div className="pm-chips">
      <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Todas</button>
      {categories.map(value => <button type="button" key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>
        {value === 'food-shopping' ? 'Compras' : value}<span>{lists.filter(list => list.category?.toLowerCase() === value).length}</span>
      </button>)}
    </div>
    <div className="panel-tools pm-list-search">
      <label className="panel-search">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar listas o elementos" />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpiar"><X size={16} /></button> : null}
      </label>
    </div>

    <section className="pm-list-cards" aria-label="Listas del camporee">
      {visibleLists.length ? visibleLists.map((list, index) => {
        const done = (list.list_items || []).filter(item => item.is_done).length;
        const total = list.list_items?.length || 0;
        return <article className="pm-list-card" key={list.id}>
          <Link href={'/more/lists/' + list.id} prefetch={index < 4} className="pm-list-card-main" aria-label={'Abrir lista ' + list.title}>
            <span className="pm-icon">{categoryIcon(list.category)}</span>
            <span className="pm-list-copy">
              <strong>{list.title}</strong>
              <small>{list.category || 'Lista'} · {done}/{total} marcados</small>
              <span className="pm-progress"><i style={{ width: (total ? done / total * 100 : 0) + '%' }} /></span>
            </span>
            <ListCardStatus />
          </Link>
        </article>;
      }) : <div className="empty compact">No hay listas que coincidan con esta búsqueda.</div>}
    </section>

    <BottomSheet open={openList} onClose={() => setOpenList(false)} busy={creating} title="Nueva lista">
      <form onSubmit={event => { event.preventDefault(); void addList(new FormData(event.currentTarget)); }} className="panel-form pm-sheet-form">
        <div className="pm-sheet-fields">
          <label className="pm-field"><span>Nombre de la lista <b className="pm-required">*</b></span><input name="title" required maxLength={120} /></label>
          <label className="pm-field"><span>Categoría</span><input name="category" maxLength={80} /></label>
        </div>
        <div className="pm-sheet-footer"><button type="submit" className="primary-btn" disabled={creating}>{creating ? 'Creando…' : 'Crear lista'}</button></div>
      </form>
    </BottomSheet>
    {canEdit ? <button type="button" className="pm-fab" onClick={() => setOpenList(true)} aria-label="Crear lista"><Plus size={20} /> Lista</button> : null}
  </>;
}
