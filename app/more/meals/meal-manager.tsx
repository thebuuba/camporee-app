'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, Pencil, Plus, Search, ShoppingCart, Trash2, Utensils, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval, reportMutationError, reportMutationSuccess } from "@/lib/client-ui";

const mealTypes = [
  ["breakfast","Desayuno"],["snack_am","Merienda AM"],["lunch","Almuerzo"],["snack_pm","Merienda PM"],["dinner","Cena"],["other","Otro"],
] as const;
const mealLabel = (value:string) => mealTypes.find(([key]) => key === value)?.[1] ?? value;
const numberValue = (value:any) => Number(value ?? 0);

export default function MealManager({ camporeeId, canEdit, canEditLists, initialMeals, inventory, initialLists }: { camporeeId: string; canEdit: boolean; canEditLists:boolean; initialMeals: any[]; inventory:any[]; initialLists:any[] }) {
  const [meals, setMeals] = useState(initialMeals);
  const [lists, setLists] = useState(initialLists);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [ingredientFor, setIngredientFor] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setMeals(initialMeals); }, [initialMeals]);
  useEffect(() => { setLists(initialLists); }, [initialLists]);

  const inventoryMap = useMemo(() => new Map(inventory.map((item:any) => [item.id,item])), [inventory]);
  const generatedIngredientIds = useMemo(() => new Set(lists.flatMap((list:any) => (list.list_items || []).map((item:any) => item.source_meal_ingredient_id).filter(Boolean))), [lists]);
  const visible = useMemo(() => meals.filter((meal) => { const ingredientText=(meal.meal_ingredients||[]).map((item:any)=>item.name).join(' '); const matchesText = `${mealLabel(meal.meal_type)} ${meal.menu} ${meal.responsible_name || ""} ${ingredientText}`.toLowerCase().includes(query.toLowerCase()); return matchesText && (filter === "all" || meal.meal_type === filter); }), [meals, query, filter]);

  function openNew() { setEditing(null); setFormError(''); setOpen(true); }
  function openEdit(meal: any) { setEditing(meal); setFormError(''); setOpen(true); }
  function closeMeal(){if(saving)return;setOpen(false);setEditing(null);setFormError('')}
  function shortage(ingredient:any){ const stock = ingredient.inventory_item_id ? inventoryMap.get(ingredient.inventory_item_id) : null; return Math.max(0, numberValue(ingredient.required_quantity) - numberValue(stock?.quantity)); }

  async function saveMeal(formData: FormData) {
    if (!canEdit || saving) return;
    const menu = String(formData.get("menu") || "").trim(); const mealDate = String(formData.get("meal_date") || "");
    if (!menu || !mealDate){setFormError('Completa la fecha y el menú.');return;}
    setSaving(true);setFormError('');
    try{
      const payload = { camporee_id: camporeeId, meal_date: mealDate, meal_type: String(formData.get("meal_type") || "breakfast"), menu, responsible_name: String(formData.get("responsible_name") || "").trim() || null, notes: String(formData.get("notes") || "").trim() || null };
      const request = editing ? supabase.from("meals").update(payload).eq("id", editing.id) : supabase.from("meals").insert(payload);
      const { data, error } = await request.select("id,meal_date,meal_type,menu,responsible_name,notes").single();
      if(error||!data){const message=reportMutationError(error,'No se pudo guardar la comida.');setFormError(message);return;}
      const hydrated={...data,meal_ingredients:editing?.meal_ingredients||[]};
      setMeals((current) => (editing ? current.map((item) => item.id === data.id ? hydrated : item) : [...current, hydrated]).sort((a,b) => `${a.meal_date}${a.meal_type}`.localeCompare(`${b.meal_date}${b.meal_type}`)));
      reportMutationSuccess(editing?'Comida actualizada.':'Comida guardada.');setOpen(false);setEditing(null);router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo guardar la comida.');setFormError(message)}finally{setSaving(false)}
  }

  async function addIngredient(formData:FormData){ if(!canEdit||!ingredientFor)return; const name=String(formData.get('name')||'').trim(); if(!name)return; const mealId=ingredientFor.id; const payload={meal_id:mealId,name,required_quantity:Number(formData.get('required_quantity')||1),unit:String(formData.get('unit')||'').trim()||null,inventory_item_id:String(formData.get('inventory_item_id')||'')||null}; const {data,error}=await supabase.from('meal_ingredients').insert(payload).select('id,name,required_quantity,unit,inventory_item_id').single(); if(error||!data){reportMutationError(error,'No se pudo agregar el ingrediente.');return;} setMeals(cur=>cur.map(meal=>meal.id===mealId?{...meal,meal_ingredients:[...(meal.meal_ingredients||[]),data]}:meal));setIngredientFor(null);reportMutationSuccess('Ingrediente agregado.');router.refresh(); }
  async function removeIngredient(mealId:string,ingredientId:string){ if(!canEdit||!confirmRemoval('este ingrediente'))return; const previous=meals; setMeals(cur=>cur.map(meal=>meal.id===mealId?{...meal,meal_ingredients:(meal.meal_ingredients||[]).filter((item:any)=>item.id!==ingredientId)}:meal)); const {error}=await supabase.from('meal_ingredients').delete().eq('id',ingredientId); if(error){setMeals(previous);reportMutationError(error,'No se pudo eliminar el ingrediente.');}else{reportMutationSuccess('Ingrediente eliminado.');router.refresh();} }
  async function ensureFoodShoppingList(){ const existing=lists.find((list:any)=>list.category==='food-shopping') || lists.find((list:any)=>list.title.toLowerCase()==='compras de comidas'); if(existing)return existing; const {data,error}=await supabase.from('lists').insert({camporee_id:camporeeId,title:'Compras de comidas',category:'food-shopping'}).select('id,title,category').single(); if(error||!data){reportMutationError(error,'No se pudo crear la lista de compras.');return null;} const created={...data,list_items:[]}; setLists(cur=>[...cur,created]); router.refresh(); return created; }
  async function addShortageToShopping(meal:any,ingredient:any){ if(!canEditLists||generatedIngredientIds.has(ingredient.id))return; const missing=shortage(ingredient); if(missing<=0)return; const list=await ensureFoodShoppingList(); if(!list)return; const note=`Faltante para ${mealLabel(meal.meal_type)} · ${new Date(`${meal.meal_date}T00:00:00`).toLocaleDateString('es-DO',{day:'numeric',month:'short'})}`; const {data,error}=await supabase.from('list_items').insert({list_id:list.id,label:ingredient.name,quantity:missing,unit:ingredient.unit||null,notes:note,source_meal_ingredient_id:ingredient.id}).select('id,label,quantity,unit,is_done,notes,sort_order,source_meal_ingredient_id').single(); if(error||!data){reportMutationError(error,'No se pudo enviar el faltante a compras.');return;}setLists(cur=>cur.map((row:any)=>row.id===list.id?{...row,list_items:[...(row.list_items||[]),data]}:row));reportMutationSuccess('Faltante agregado a compras.');router.refresh(); }
  async function removeMeal(id: string) { if (!canEdit || !confirmRemoval('esta comida')) return; const previous=meals; setMeals((current) => current.filter((item) => item.id !== id)); const { error } = await supabase.from("meals").delete().eq("id", id); if (error){setMeals(previous);reportMutationError(error,'No se pudo eliminar la comida.');}else{reportMutationSuccess('Comida eliminada.');router.refresh();} }

  const totalIngredients=meals.reduce((sum,meal)=>sum+(meal.meal_ingredients?.length||0),0); const missingIngredients=meals.reduce((sum,meal)=>sum+(meal.meal_ingredients||[]).filter((ingredient:any)=>shortage(ingredient)>0).length,0);

  return <>
    <section className="inventory-summary"><div className="ios-card mini-stat"><strong>{totalIngredients}</strong><small>Ingredientes planificados</small></div><div className="ios-card mini-stat"><strong>{missingIngredients}</strong><small>Con faltantes</small></div></section>
    <div className="panel-tools"><label className="panel-search"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar comida, ingrediente o responsable"/>{query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpiar"><X size={16}/></button> : null}</label><div className="filter-chips"><button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas</button>{mealTypes.map(([value,label]) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>{canEdit ? <button type="button" className="panel-add" onClick={openNew}><Plus size={18}/> Agregar comida</button> : null}</div>
    {open ? <div className="sheet-backdrop" onClick={closeMeal}><section className="sheet-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>{editing ? "Editar comida" : "Nueva comida"}</h2><form onSubmit={(event)=>{event.preventDefault();void saveMeal(new FormData(event.currentTarget));}} className="panel-form">{formError?<div className="auth-alert error" role="alert">{formError}</div>:null}<div className="form-two"><input name="meal_date" type="date" defaultValue={editing?.meal_date || ""} required/><select name="meal_type" defaultValue={editing?.meal_type || "breakfast"}>{mealTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><textarea name="menu" placeholder="Menú" defaultValue={editing?.menu || ""} required/><input name="responsible_name" placeholder="Responsable" defaultValue={editing?.responsible_name || ""}/><textarea name="notes" placeholder="Notas" defaultValue={editing?.notes || ""}/><button type="submit" className="primary-btn" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar comida"}</button></form></section></div> : null}
    {ingredientFor ? <div className="sheet-backdrop" onClick={()=>setIngredientFor(null)}><section className="sheet-card" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><h2>Agregar ingrediente</h2><form onSubmit={(event)=>{event.preventDefault();void addIngredient(new FormData(event.currentTarget));}} className="panel-form"><input name="name" placeholder="Arroz, pan, leche…" required/><div className="form-two"><input name="required_quantity" type="number" min="0" step="0.01" defaultValue="1"/><input name="unit" placeholder="lb, kg, paquetes…"/></div><select name="inventory_item_id" defaultValue=""><option value="">No vincular al inventario</option>{inventory.map((item:any)=><option key={item.id} value={item.id}>{item.name} · {item.quantity} {item.unit||''}</option>)}</select><button type="submit" className="primary-btn">Agregar ingrediente</button></form></section></div> : null}
    <section className="panel-list">{visible.length ? visible.map((meal) => <section className="section-card ios-card meal-card" key={meal.id}><div className="section-head inside"><div><h3>{mealLabel(meal.meal_type)}</h3><span>{new Date(`${meal.meal_date}T00:00:00`).toLocaleDateString("es-DO", { dateStyle: "medium" })}</span></div>{canEdit?<div className="row-actions"><button type="button" className="row-icon-btn" onClick={() => openEdit(meal)} aria-label="Editar"><Pencil size={16}/></button><button type="button" className="row-icon-btn danger" onClick={() => removeMeal(meal.id)} aria-label="Eliminar"><Trash2 size={17}/></button></div>:null}</div><div className="meal-menu"><Utensils size={17}/><b>{meal.menu}</b></div>{meal.responsible_name ? <small className="meal-responsible">Responsable: {meal.responsible_name}</small> : null}<div className="meal-ingredients-head"><strong>Ingredientes</strong>{canEdit?<button type="button" className="secondary-btn compact-btn" onClick={()=>setIngredientFor(meal)}><Plus size={14}/> Agregar</button>:null}</div><div className="meal-ingredients">{(meal.meal_ingredients||[]).length?(meal.meal_ingredients||[]).map((ingredient:any)=>{const stock=ingredient.inventory_item_id?inventoryMap.get(ingredient.inventory_item_id):null;const missing=shortage(ingredient);const queued=generatedIngredientIds.has(ingredient.id);return <article className="meal-ingredient" key={ingredient.id}><div className="meal-ingredient-main"><span className={`ingredient-stock ${missing>0?'missing':'ok'}`}><PackageCheck size={14}/></span><div><strong>{ingredient.name}</strong><small>Necesitas {ingredient.required_quantity} {ingredient.unit||''}{stock?` · Hay ${stock.quantity} ${stock.unit||ingredient.unit||''}`:' · Sin inventario vinculado'}</small></div></div><div className="meal-ingredient-actions">{missing>0?<span className="shortage-pill">Faltan {missing} {ingredient.unit||''}</span>:<span className="stock-ok">Completo</span>}{missing>0&&canEditLists?<button type="button" className={`row-icon-btn ${queued?'selected':''}`} disabled={queued} onClick={()=>addShortageToShopping(meal,ingredient)} aria-label="Agregar faltante a compras"><ShoppingCart size={15}/></button>:null}{canEdit?<button type="button" className="row-icon-btn danger" onClick={()=>removeIngredient(meal.id,ingredient.id)} aria-label="Eliminar ingrediente"><Trash2 size={15}/></button>:null}</div></article>}):<div className="empty compact">Agrega los ingredientes para saber qué falta comprar.</div>}</div></section>) : <div className="empty compact">No hay comidas que coincidan con este filtro.</div>}</section>
  </>;
}
