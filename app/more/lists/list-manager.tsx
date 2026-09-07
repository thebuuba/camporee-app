'use client';

import { useState } from "react";
import { Check, Circle, ListChecks, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ListRow = { id:string; title:string; category:string|null; list_items:any[] };

export default function ListManager({ camporeeId, canEdit, initialLists }: { camporeeId:string; canEdit:boolean; initialLists:ListRow[] }) {
  const [lists, setLists] = useState(initialLists);
  const [openList, setOpenList] = useState(false);
  const [itemFor, setItemFor] = useState<string|null>(null);
  const supabase = createClient();

  async function addList(formData:FormData) {
    if (!canEdit) return;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    const { data, error } = await supabase.from('lists').insert({ camporee_id:camporeeId, title, category:String(formData.get('category') || '').trim() || null }).select('id,title,category').single();
    if (!error && data) { setLists((cur) => [...cur, { ...data, list_items:[] }]); setOpenList(false); }
  }

  async function addItem(formData:FormData) {
    if (!canEdit || !itemFor) return;
    const label = String(formData.get('label') || '').trim();
    if (!label) return;
    const { data, error } = await supabase.from('list_items').insert({ list_id:itemFor, label, quantity:Number(formData.get('quantity') || 1), unit:String(formData.get('unit') || '').trim() || null }).select('id,label,quantity,unit,is_done,notes,sort_order').single();
    if (!error && data) { setLists((cur) => cur.map((list) => list.id === itemFor ? { ...list, list_items:[...(list.list_items || []), data] } : list)); setItemFor(null); }
  }

  async function toggleItem(listId:string,item:any) {
    if (!canEdit) return;
    const next = !item.is_done;
    const { error } = await supabase.from('list_items').update({ is_done:next }).eq('id', item.id);
    if (!error) setLists((cur) => cur.map((list) => list.id === listId ? { ...list, list_items:list.list_items.map((it) => it.id === item.id ? { ...it, is_done:next } : it) } : list));
  }

  async function removeList(id:string) {
    if (!canEdit) return;
    const { error } = await supabase.from('lists').delete().eq('id', id);
    if (!error) setLists((cur) => cur.filter((list) => list.id !== id));
  }

  return <>
    {canEdit ? <button className="panel-add" onClick={() => setOpenList(true)}><Plus size={18}/> Nueva lista</button> : null}
    {openList ? <div className="sheet-backdrop" onClick={() => setOpenList(false)}><section className="sheet-card" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>Nueva lista</h2><form action={addList} className="panel-form"><input name="title" placeholder="Nombre de la lista" required/><input name="category" placeholder="Categoría: compras, equipaje…"/><button className="primary-btn">Crear lista</button></form></section></div> : null}
    {itemFor ? <div className="sheet-backdrop" onClick={() => setItemFor(null)}><section className="sheet-card" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>Agregar elemento</h2><form action={addItem} className="panel-form"><input name="label" placeholder="Elemento" required/><div className="form-two"><input name="quantity" type="number" min="0" step="0.01" defaultValue="1"/><input name="unit" placeholder="Unidad"/></div><button className="primary-btn">Agregar</button></form></section></div> : null}
    <section className="panel-list">{lists.length ? lists.map((list) => { const done=(list.list_items||[]).filter((it)=>it.is_done).length; return <section className="section-card ios-card" key={list.id}><div className="section-head inside"><div><h3>{list.title}</h3><span>{done}/{list.list_items?.length ?? 0} listos</span></div>{canEdit ? <button className="row-icon-btn danger" onClick={() => removeList(list.id)}><Trash2 size={17}/></button> : null}</div><div className="panel-list">{(list.list_items||[]).map((item) => <article className={'panel-row ' + (item.is_done ? 'is-done' : '')} key={item.id}><button className="status-btn" onClick={() => toggleItem(list.id,item)} disabled={!canEdit}>{item.is_done ? <Check size={18}/> : <Circle size={18}/>}</button><div className="panel-row-copy"><strong>{item.label}</strong><small>{item.quantity ?? 1}{item.unit ? ` ${item.unit}` : ''}</small></div></article>)}</div>{canEdit ? <button className="secondary-btn" style={{width:'100%',marginTop:10}} onClick={() => setItemFor(list.id)}><Plus size={16}/> Agregar elemento</button> : null}</section> }) : <div className="empty compact"><ListChecks size={22}/> Todavía no hay listas.</div>}</section>
  </>;
}
