'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ListChecks, Plus, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';
import { mutationProblem, mutationNotice } from '@/lib/mutation-result';

type ListItem = {
  id: string; label: string; quantity: number | null; unit: string | null;
  is_done: boolean; notes: string | null; sort_order: number | null;
};

export default function ListDetailManager({ camporeeId, listId, canEdit, initialItems, backHref }: {
  camporeeId: string; listId: string; canEdit: boolean; initialItems: ListItem[]; backHref: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyItems, setBusyItems] = useState<string[]>([]);
  const [deletingList, setDeletingList] = useState(false);
  const labelInput = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setItems(initialItems); }, [initialItems]);

  const total = items.length;
  const done = items.filter(item => item.is_done).length;
  const busy = (id: string) => busyItems.includes(id);
  function markBusy(id: string) { setBusyItems(current => [...current, id]); }
  function clearBusy(id: string) { setBusyItems(current => current.filter(value => value !== id)); }

  async function toggleItem(item: ListItem) {
    if (!canEdit || busy(item.id) || deletingList) return;
    const next = !item.is_done;
    markBusy(item.id);
    try {
      const result = await supabase.from('list_items').update({ is_done: next })
        .eq('id', item.id).eq('list_id', listId).eq('camporee_id',camporeeId).select('id');
      const error = mutationProblem(result,[item.id]);
      if (error) throw error;
      setItems(current => current.map(row => row.id === item.id ? { ...row, is_done: next } : row));
      reportMutationSuccess(mutationNotice(result.status,'Elemento actualizado.'));
      if (result.status !== 202) router.refresh();
    } catch (error) {
      reportMutationError(error, 'No se pudo actualizar el elemento.');
    } finally {
      clearBusy(item.id);
    }
  }

  async function addItem(form: HTMLFormElement) {
    if (!canEdit || adding || deletingList) return;
    const formData = new FormData(form);
    const label = String(formData.get('label') || '').trim();
    const quantity = Number(formData.get('quantity') || '1');
    if (!label || !Number.isFinite(quantity) || quantity < 0) return;
    setAdding(true);
    try {
      const result = await supabase.from('list_items').insert({
        camporee_id:camporeeId, list_id: listId, label, quantity,
        unit: String(formData.get('unit') || '').trim() || null,
        notes: String(formData.get('notes') || '').trim() || null,
      }).select('id,label,quantity,unit,is_done,notes,sort_order').single();
      const { data } = result; const error = mutationProblem(result);
      if (error || !data) { reportMutationError(error, 'No se pudo agregar el elemento.'); return; }
      setItems(current => [...current, data]);
      form.reset();
      setDraftLabel('');
      labelInput.current?.focus();
      reportMutationSuccess(mutationNotice(result.status,'Elemento agregado.'));
      if (result.status !== 202) router.refresh();
    } catch (error) {
      reportMutationError(error, 'No se pudo agregar el elemento.');
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(item: ListItem) {
    if (!canEdit || busy(item.id) || deletingList || !confirmRemoval('este elemento')) return;
    markBusy(item.id);
    try {
      const result = await supabase.from('list_items').delete()
        .eq('id', item.id).eq('list_id', listId).eq('camporee_id',camporeeId).select('id');
      const error = mutationProblem(result,[item.id]);
      if (error) throw error;
      setItems(current => current.filter(row => row.id !== item.id));
      reportMutationSuccess(mutationNotice(result.status,'Elemento eliminado.'));
      if (result.status !== 202) router.refresh();
    } catch (error) {
      reportMutationError(error, 'No se pudo eliminar el elemento.');
    } finally {
      clearBusy(item.id);
    }
  }

  async function removeList() {
    if (!canEdit || deletingList || !confirmRemoval('esta lista y todos sus elementos')) return;
    setDeletingList(true);
    try {
      const result = await supabase.from('lists').delete()
        .eq('id', listId).eq('camporee_id', camporeeId).select('id');
      const error = mutationProblem(result,[listId]);
      if (error) throw error;
      reportMutationSuccess(mutationNotice(result.status,'Lista eliminada.'));
      if (result.status === 202) { setDeletingList(false); return; }
      router.replace(backHref);
      router.refresh();
    } catch (error) {
      setDeletingList(false);
      reportMutationError(error, 'No se pudo eliminar la lista.');
    }
  }

  return <div className="pm-list-detail-screen">
    <section className="pm-list-detail-summary" aria-label="Progreso de la lista">
      <span className="pm-detail-summary-icon"><ListChecks size={24} /></span>
      <div className="pm-detail-summary-copy">
        <strong>{done} de {total} marcados</strong>
        <small>{total === 0 ? 'Esta lista todavía no tiene elementos' : done === total ? '¡Todo listo!' : (total - done) + ' por completar'}</small>
      </div>
      <span className="pm-detail-summary-count">{total ? Math.round(done / total * 100) : 0}%</span>
      <span className="pm-progress"><i style={{ width: (total ? done / total * 100 : 0) + '%' }} /></span>
    </section>

    <div className="pm-list-detail-heading">
      <h2>Elementos</h2>
      <span>{total}</span>
    </div>

    <section className="pm-list-detail-items" aria-label="Elementos de la lista">
      {items.length ? items.map(item => <article className={'pm-list-item' + (item.is_done ? ' is-done' : '')} key={item.id}>
        <button type="button" className="pm-check" disabled={!canEdit || busy(item.id) || deletingList}
          aria-pressed={item.is_done} aria-label={(item.is_done ? 'Desmarcar ' : 'Marcar ') + item.label}
          onClick={() => void toggleItem(item)}>{item.is_done ? <Check size={19} strokeWidth={2.7} /> : null}</button>
        <div className="pm-list-item-copy">
          <strong>{item.label}</strong>
          <small>{(item.quantity ?? 1) + (item.unit ? ' ' + item.unit : '')}{item.notes ? ' · ' + item.notes : ''}</small>
        </div>
        {canEdit ? <button type="button" className="pm-list-delete-item" disabled={busy(item.id) || deletingList}
          onClick={() => void removeItem(item)} aria-label={'Eliminar ' + item.label}><Trash2 size={18} /></button> : null}
      </article>) : <div className="pm-list-detail-empty">Todavía no hay elementos. {canEdit ? 'Agrega el primero para empezar.' : ''}</div>}
    </section>

    {canEdit ? <>
      {showAdd ? <form className="pm-list-add-form" onSubmit={event => { event.preventDefault(); void addItem(event.currentTarget); }}>
        <div className="pm-list-add-head">
          <strong>Nuevo elemento</strong>
          <button type="button" onClick={() => { setShowAdd(false); setShowDetails(false); setDraftLabel(''); }}
            aria-label="Cancelar nuevo elemento" disabled={adding}><X size={17} /></button>
        </div>
        <div className="pm-list-add-main">
          <input name="label" ref={labelInput} autoFocus required type="text"
            maxLength={180} autoComplete="off" enterKeyHint="done"
            aria-label="Nombre del elemento" placeholder="Ej. Ajo, linterna, agua…"
            value={draftLabel} onChange={event => setDraftLabel(event.target.value)} />
          <button type="submit" className="pm-list-add-submit" disabled={!draftLabel.trim() || adding || deletingList}>
            {adding ? 'Guardando…' : <><Plus size={18} /> Añadir</>}
          </button>
        </div>
        <button type="button" className="pm-list-add-options" aria-expanded={showDetails}
          aria-controls={showDetails ? 'pm-list-optional-' + listId : undefined}
          disabled={adding} onClick={() => setShowDetails(current => !current)}>
          <ChevronDown size={16} className={showDetails ? 'is-open' : ''} />
          {showDetails ? 'Ocultar detalles' : 'Cantidad, unidad y notas (opcional)'}
        </button>
        {showDetails ? <div className="pm-list-add-more" id={'pm-list-optional-' + listId}>
          <div className="pm-list-add-two">
            <label><span>Cantidad</span><input name="quantity" type="number" min="0" step="0.01" defaultValue="1" /></label>
            <label><span>Unidad</span><input name="unit" maxLength={60} placeholder="Ej. libra, unidad…" /></label>
          </div>
          <label><span>Notas</span><textarea name="notes" rows={2} placeholder="Detalles adicionales" /></label>
        </div> : null}
      </form> : <button type="button" className="pm-list-open-add" onClick={() => setShowAdd(true)}
        disabled={deletingList}><Plus size={20} /> Agregar elemento</button>}
      <details className="pm-list-manage">
        <summary><ChevronDown size={16} /> Opciones de la lista</summary>
        <button type="button" className="pm-list-remove-list" disabled={deletingList} onClick={() => void removeList()}>
          <Trash2 size={17} /> {deletingList ? 'Eliminando lista…' : 'Eliminar esta lista'}
        </button>
      </details>
    </> : <p className="pm-list-readonly-note">Puedes consultar esta lista, pero no tienes permisos para modificarla.</p>}
  </div>;
}
