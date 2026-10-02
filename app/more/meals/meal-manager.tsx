'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Coffee, PackageCheck, Pencil, Plus, ShoppingCart, Soup, Trash2, Utensils } from "lucide-react";
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
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setMeals(initialMeals); }, [initialMeals]);
  useEffect(() => { setLists(initialLists); }, [initialLists]);

  const inventoryMap = useMemo(() => new Map(inventory.map((item:any) => [item.id,item])), [inventory]);
  const generatedIngredientIds = useMemo(() => new Set(lists.flatMap((list:any) => (list.list_items || []).map((item:any) => item.source_meal_ingredient_id).filter(Boolean))), [lists]);
  const dates = useMemo(() => [...new Set(meals.map(meal=>meal.meal_date))].sort(), [meals]);
  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0];
  const visible = useMemo(() => meals.filter(meal=>meal.meal_date===activeDate), [meals,activeDate]);

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

  const mealIcon = (type:string) => type==='breakfast'||type==='snack_am'?<Coffee size={21}/>:type==='lunch'?<Utensils size={21}/>:<Soup size={21}/>;
  const formatDate = (date:string) => new Date(`${date}T00:00:00`).toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long'});

  return <>
    <div className="pm-date-chips">{dates.map((date,index)=><button type="button" key={date} className={activeDate===date?'active':''} onClick={()=>{setSelectedDate(date);setSelectedMeal(null)}}>Día {index+1} · {new Date(`${date}T00:00:00`).toLocaleDateString('es-DO',{day:'numeric',month:'short'})}</button>)}</div>
    {activeDate?<p className="pm-date-label">{formatDate(activeDate)}</p>:null}
    {open ? <div className="sheet-backdrop" onClick={closeMeal}><section className="sheet-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="sheet-handle"/><h2>{editing ? "Editar comida" : "Nueva comida"}</h2><form onSubmit={(event)=>{event.preventDefault();void saveMeal(new FormData(event.currentTarget));}} className="panel-form">{formError?<div className="auth-alert error" role="alert">{formError}</div>:null}<div className="form-two"><input name="meal_date" type="date" defaultValue={editing?.meal_date || ""} required/><select name="meal_type" defaultValue={editing?.meal_type || "breakfast"}>{mealTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><textarea name="menu" placeholder="Menú" defaultValue={editing?.menu || ""} required/><input name="responsible_name" placeholder="Responsable" defaultValue={editing?.responsible_name || ""}/><textarea name="notes" placeholder="Notas" defaultValue={editing?.notes || ""}/><button type="submit" className="primary-btn" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar comida"}</button></form></section></div> : null}
    {ingredientFor ? <div className="sheet-backdrop" onClick={()=>setIngredientFor(null)}><section className="sheet-card" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><h2>Agregar ingrediente</h2><form onSubmit={(event)=>{event.preventDefault();void addIngredient(new FormData(event.currentTarget));}} className="panel-form"><input name="name" placeholder="Arroz, pan, leche…" required/><div className="form-two"><input name="required_quantity" type="number" min="0" step="0.01" defaultValue="1"/><input name="unit" placeholder="lb, kg, paquetes…"/></div><select name="inventory_item_id" defaultValue=""><option value="">No vincular al inventario</option>{inventory.map((item:any)=><option key={item.id} value={item.id}>{item.name} · {item.quantity} {item.unit||''}</option>)}</select><button type="submit" className="primary-btn">Agregar ingrediente</button></form></section></div> : null}

    <section className="pm-meal-list">{visible.length?visible.map(meal=>{const missing=(meal.meal_ingredients||[]).filter((ingredient:any)=>shortage(ingredient)>0).length;return <article className="pm-meal-card" key={meal.id}><button type="button" className="pm-meal-main" onClick={()=>setSelectedMeal(selectedMeal===meal.id?null:meal.id)}><span className="pm-meal-icon">{mealIcon(meal.meal_type)}</span><span className="pm-meal-copy"><small>{mealLabel(meal.meal_type)} · {(meal.meal_ingredients||[]).length} ingredientes</small><strong>{meal.menu}</strong><span className="pm-meal-pills">{meal.responsible_name?<em>{meal.responsible_name}</em>:null}{missing?<em className="pm-missing">{missing} faltantes</em>:null}</span></span></button>{selectedMeal===meal.id?<div className="pm-meal-detail"><div className="pm-meal-detail-head"><strong>Ingredientes</strong>{canEdit?<div><button type="button" onClick={()=>openEdit(meal)} aria-label="Editar comida"><Pencil size={16}/></button><button type="button" onClick={()=>removeMeal(meal.id)} aria-label="Eliminar comida"><Trash2 size={16}/></button></div>:null}</div>{(meal.meal_ingredients||[]).map((ingredient:any)=>{const missing=shortage(ingredient);const stock=ingredient.inventory_item_id?inventoryMap.get(ingredient.inventory_item_id):null;return <div className="pm-ingredient" key={ingredient.id}><PackageCheck size={17}/><div><strong>{ingredient.name}</strong><small>Necesitas {ingredient.required_quantity} {ingredient.unit||''}{stock?` · Hay ${stock.quantity} ${stock.unit||''}`:''}</small></div>{missing>0?<span className="pm-missing">Faltan {missing}</span>:<span className="pm-complete">Completo</span>}{missing>0&&canEditLists?<button type="button" disabled={generatedIngredientIds.has(ingredient.id)} onClick={()=>addShortageToShopping(meal,ingredient)} aria-label="Agregar a compras"><ShoppingCart size={15}/></button>:null}{canEdit?<button type="button" onClick={()=>removeIngredient(meal.id,ingredient.id)} aria-label="Eliminar ingrediente"><Trash2 size={15}/></button>:null}</div>})}{canEdit?<button type="button" className="pm-add-ingredient" onClick={()=>setIngredientFor(meal)}><Plus size={16}/> Agregar ingrediente</button>:null}</div>:null}</article>}) : <div className="empty compact">{meals.length?'No hay comidas para este día.':'No hay comidas planificadas todavía.'}</div>}</section>
    {canEdit?<button type="button" className="pm-fab" onClick={openNew}><Plus size={20}/> Comida</button>:null}
  </>;
}
