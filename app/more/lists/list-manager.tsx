'use client';

import BottomSheet from '@/app/components/bottom-sheet';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Backpack, Check, ChevronRight, Hammer, ListChecks, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval, reportMutationError, reportMutationSuccess } from "@/lib/client-ui";

type ListRow = { id:string; title:string; category:string|null; list_items:any[] };

export default function ListManager({ camporeeId, canEdit, initialLists }: { camporeeId:string; canEdit:boolean; initialLists:ListRow[] }) {
  const [lists, setLists] = useState(initialLists);
  const [openList, setOpenList] = useState(false);
  const [itemFor, setItemFor] = useState<string|null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState('all');
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setLists(initialLists); }, [initialLists]);

  const visibleLists = useMemo(() => lists.filter((list) => {
    const haystack = `${list.title} ${list.category || ""} ${(list.list_items || []).map((item) => item.label).join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (category === 'all' || list.category?.toLowerCase() === category);
  }), [lists, query, category]);
  const categories = useMemo(() => [...new Set(lists.map((list) => list.category?.toLowerCase()).filter((value): value is string => Boolean(value)))], [lists]);
  const categoryIcon = (value: string | null) => value?.includes('compra') || value === 'food-shopping' ? <ShoppingCart size={20}/> : value?.includes('equipaje') ? <Backpack size={20}/> : value?.includes('material') ? <Hammer size={20}/> : <ListChecks size={20}/>;

  async function addList(formData:FormData) {
    if (!canEdit) return;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    const { data, error } = await supabase.from('lists').insert({ camporee_id:camporeeId, title, category:String(formData.get('category') || '').trim() || null }).select('id,title,category').single();
    if(error||!data){reportMutationError(error,'No se pudo crear la lista.');return;}
    setLists((cur) => [...cur, { ...data, list_items:[] }]); setOpenList(false); reportMutationSuccess('Lista creada.'); router.refresh();
  }

  async function addItem(formData:FormData) {
    if (!canEdit || !itemFor) return;
    const label = String(formData.get('label') || '').trim();
    if (!label) return;
    const targetListId = itemFor;
    const { data, error } = await supabase.from('list_items').insert({ list_id:targetListId, label, quantity:Number(formData.get('quantity') || 1), unit:String(formData.get('unit') || '').trim() || null, notes:String(formData.get('notes') || '').trim() || null }).select('id,label,quantity,unit,is_done,notes,sort_order').single();
    if(error||!data){reportMutationError(error,'No se pudo agregar el elemento.');return;}
    setLists((cur) => cur.map((list) => list.id === targetListId ? { ...list, list_items:[...(list.list_items || []), data] } : list)); setItemFor(null); reportMutationSuccess('Elemento agregado.'); router.refresh();
  }

  async function toggleItem(listId:string,item:any) {
    if (!canEdit) return;
    const next = !item.is_done;
    setLists((cur) => cur.map((list) => list.id === listId ? { ...list, list_items:list.list_items.map((it) => it.id === item.id ? { ...it, is_done:next } : it) } : list));
    const { error } = await supabase.from('list_items').update({ is_done:next }).eq('id', item.id);
    if (error){setLists((cur) => cur.map((list) => list.id === listId ? { ...list, list_items:list.list_items.map((it) => it.id === item.id ? { ...it, is_done:item.is_done } : it) } : list));reportMutationError(error,'No se pudo actualizar el elemento.');}
    else router.refresh();
  }

  async function removeItem(listId:string,itemId:string) {
    if (!canEdit || !confirmRemoval('este elemento')) return;
    const previous = lists;
    setLists((cur) => cur.map((list) => list.id === listId ? { ...list, list_items:list.list_items.filter((item) => item.id !== itemId) } : list));
    const { error } = await supabase.from('list_items').delete().eq('id', itemId);
    if (error){setLists(previous);reportMutationError(error,'No se pudo eliminar el elemento.');}else{reportMutationSuccess('Elemento eliminado.');router.refresh();}
  }

  async function removeList(id:string) {
    if (!canEdit || !confirmRemoval('esta lista y sus elementos')) return;
    const previous = lists;
    setLists((cur) => cur.filter((list) => list.id !== id));
    const { error } = await supabase.from('lists').delete().eq('id', id);
    if (error){setLists(previous);reportMutationError(error,'No se pudo eliminar la lista.');}else{reportMutationSuccess('Lista eliminada.');router.refresh();}
  }

  return <>
    <div className="pm-chips"><button type="button" className={category==='all'?'active':''} onClick={()=>setCategory('all')}>Todas</button>{categories.map(value=><button type="button" key={value} className={category===value?'active':''} onClick={()=>setCategory(value)}>{value === 'food-shopping' ? 'Compras' : value}<span>{lists.filter(list=>list.category?.toLowerCase()===value).length}</span></button>)}</div>
    <div className="panel-tools pm-list-search"><label className="panel-search"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar listas o elementos"/>{query ? <button type="button" onClick={()=>setQuery("")} aria-label="Limpiar"><X size={16}/></button> : null}</label></div>
    <BottomSheet open={Boolean(openList)} onClose={() => setOpenList(false)} title={<>Nueva lista</>} ><form onSubmit={(event)=>{event.preventDefault();void addList(new FormData(event.currentTarget));}} className="panel-form pm-sheet-form"><div className="pm-sheet-fields"><label className="pm-field"><span>Nombre de la lista <b className="pm-required">*</b></span><input name="title"  required/></label><label className="pm-field"><span>Categoría</span><input name="category" /></label></div><div className="pm-sheet-footer"><button type="submit" className="primary-btn">Crear lista</button></div></form></BottomSheet>
    <BottomSheet open={Boolean(itemFor)} onClose={() => setItemFor(null)} title={<>Agregar elemento</>} ><form onSubmit={(event)=>{event.preventDefault();void addItem(new FormData(event.currentTarget));}} className="panel-form pm-sheet-form"><div className="pm-sheet-fields"><label className="pm-field"><span>Elemento <b className="pm-required">*</b></span><input name="label"  required/></label><div className="form-two"><label className="pm-field"><span>Cantidad</span><input name="quantity" type="number" min="0" step="0.01" defaultValue="1"/></label><label className="pm-field"><span>Unidad</span><input name="unit" /></label></div><label className="pm-field"><span>Notas</span><textarea name="notes" /></label></div><div className="pm-sheet-footer"><button type="submit" className="primary-btn">Agregar</button></div></form></BottomSheet>
    <section className="pm-list-cards">{visibleLists.length ? visibleLists.map(list=>{const done=(list.list_items||[]).filter(it=>it.is_done).length;const total=list.list_items?.length||0;return <section className="pm-list-card" key={list.id}><button type="button" className="pm-list-card-main" onClick={()=>setSelectedList(selectedList===list.id?null:list.id)}><span className="pm-icon">{categoryIcon(list.category)}</span><span className="pm-list-copy"><strong>{list.title}</strong><small>{list.category || 'Lista'} · {done}/{total} marcados</small><span className="pm-progress"><i style={{width:`${total?done/total*100:0}%`}}/></span></span><ChevronRight size={16}/></button><BottomSheet open={selectedList===list.id} onClose={()=>setSelectedList(null)} title={list.title} description={`${done} de ${total} marcados`} ><div className="pm-list-detail">{(list.list_items||[]).map(item=><article className={'pm-list-item '+(item.is_done?'is-done':'')} key={item.id}><button type="button" className="pm-check" onClick={()=>toggleItem(list.id,item)} disabled={!canEdit} aria-label={item.is_done?'Desmarcar':'Marcar'}>{item.is_done?<Check size={15}/>:null}</button><div><strong>{item.label}</strong><small>{item.quantity ?? 1}{item.unit?` ${item.unit}`:''}{item.notes?` · ${item.notes}`:''}</small></div>{canEdit?<button type="button" className="row-icon-btn danger" onClick={()=>removeItem(list.id,item.id)} aria-label="Eliminar elemento"><Trash2 size={15}/></button>:null}</article>)}{canEdit?<div className="pm-list-commands"><button type="button" onClick={()=>setItemFor(list.id)}><Plus size={16}/> Agregar elemento</button><button type="button" onClick={()=>{setSelectedList(null);removeList(list.id)}} aria-label="Eliminar lista"><Trash2 size={16}/></button></div>:null}</div></BottomSheet></section>}) : <div className="empty compact">No hay listas que coincidan con esta búsqueda.</div>}</section>
    {canEdit?<button type="button" className="pm-fab" onClick={()=>setOpenList(true)}><Plus size={20}/> Lista</button>:null}
  </>;
}
