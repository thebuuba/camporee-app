'use client';

import BottomSheet from '@/app/components/bottom-sheet';
import { mutationProblem, mutationNotice } from '@/lib/mutation-result';
import { allocateMealStock } from '@/lib/meal-stock';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Coffee, PackageCheck, Pencil, Plus, ShoppingCart, Soup, Trash2, Utensils } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmRemoval, reportMutationError, reportMutationSuccess } from "@/lib/client-ui";

const mealTypes = [
  ["breakfast","Desayuno"],["snack_am","Merienda AM"],["lunch","Almuerzo"],["snack_pm","Merienda PM"],["dinner","Cena"],["other","Otro"],
] as const;
const mealLabel = (value:string) => mealTypes.find(([key]) => key === value)?.[1] ?? value;


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
  const allocation = useMemo(() => allocateMealStock(meals, inventory), [meals, inventory]);
  function shortage(ingredient:any){ return allocation.get(ingredient.id)?.missing || 0; }

  async function saveMeal(formData: FormData) {
    if (!canEdit || saving) return;
    const menu = String(formData.get("menu") || "").trim(); const mealDate = String(formData.get("meal_date") || "");
    if (!menu || !mealDate){setFormError('Completa la fecha y el menú.');return;}
    setSaving(true);setFormError('');
    try{
      const payload = { camporee_id: camporeeId, meal_date: mealDate, meal_type: String(formData.get("meal_type") || "breakfast"), menu, responsible_name: String(formData.get("responsible_name") || "").trim() || null, notes: String(formData.get("notes") || "").trim() || null };
      const request = editing ? supabase.from("meals").update(payload).eq("id", editing.id).eq("camporee_id", camporeeId) : supabase.from("meals").insert(payload);
      const result = await request.select("id,meal_date,meal_type,menu,responsible_name,notes").single(); const { data, status } = result; const error = mutationProblem(result, editing ? [editing.id] : undefined);
      if(error||!data){const message=reportMutationError(error,'No se pudo guardar la comida.');setFormError(message);return;}
      const hydrated={...data,meal_ingredients:editing?.meal_ingredients||[]};
      setMeals((current) => (editing ? current.map((item) => item.id === data.id ? hydrated : item) : [...current, hydrated]).sort((a,b) => `${a.meal_date}${a.meal_type}`.localeCompare(`${b.meal_date}${b.meal_type}`)));
      reportMutationSuccess(mutationNotice(status, editing?'Comida actualizada.':'Comida guardada.'));setOpen(false);setEditing(null);if(status!==202)router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo guardar la comida.');setFormError(message)}finally{setSaving(false)}
  }

  async function addIngredient(formData:FormData){ if(!canEdit||!ingredientFor)return; const name=String(formData.get('name')||'').trim(); if(!name)return; const mealId=ingredientFor.id; const payload={meal_id:mealId,name,required_quantity:Number(formData.get('required_quantity')||1),unit:String(formData.get('unit')||'').trim()||null,inventory_item_id:String(formData.get('inventory_item_id')||'')||null}; const result = await supabase.from('meal_ingredients').insert(payload).select('id,name,required_quantity,unit,inventory_item_id').single(); const { data, status } = result; const error = mutationProblem(result); if(error||!data){reportMutationError(error,'No se pudo agregar el ingrediente.');return;} setMeals(cur=>cur.map(meal=>meal.id===mealId?{...meal,meal_ingredients:[...(meal.meal_ingredients||[]),data]}:meal));setIngredientFor(null);reportMutationSuccess(mutationNotice(status, 'Ingrediente agregado.'));if(status!==202)router.refresh(); }
  async function removeIngredient(mealId:string,ingredientId:string){ if(!canEdit||!confirmRemoval('este ingrediente'))return; const previous=meals; setMeals(cur=>cur.map(meal=>meal.id===mealId?{...meal,meal_ingredients:(meal.meal_ingredients||[]).filter((item:any)=>item.id!==ingredientId)}:meal)); const result=await supabase.from('meal_ingredients').delete().eq('id',ingredientId).eq('meal_id',mealId).select('id').single(); const error=mutationProblem(result,[ingredientId]);const status=result.status; if(error){setMeals(previous);reportMutationError(error,'No se pudo eliminar el ingrediente.');}else{reportMutationSuccess(mutationNotice(status, 'Ingrediente eliminado.'));if(status!==202)router.refresh();} }
  async function ensureFoodShoppingList(){ const existing=lists.find((list:any)=>list.category==='food-shopping') || lists.find((list:any)=>list.title.toLowerCase()==='compras de comidas'); if(existing)return existing; const result = await supabase.from('lists').insert({camporee_id:camporeeId,title:'Compras de comidas',category:'food-shopping'}).select('id,title,category').single(); const { data, status } = result; const error = mutationProblem(result); if(error||!data){reportMutationError(error,'No se pudo crear la lista de compras.');return null;} const created={...data,list_items:[]}; setLists(cur=>[...cur,created]); if(status!==202)router.refresh(); return created; }
  async function addShortageToShopping(meal:any,ingredient:any){ if(!canEditLists||generatedIngredientIds.has(ingredient.id))return; const missing=shortage(ingredient); if(missing<=0)return; const list=await ensureFoodShoppingList(); if(!list)return; const note=`Faltante para ${mealLabel(meal.meal_type)} · ${new Date(`${meal.meal_date}T00:00:00`).toLocaleDateString('es-DO',{day:'numeric',month:'short'})}`; const result = await supabase.from('list_items').insert({list_id:list.id,label:ingredient.name,quantity:missing,unit:ingredient.unit||null,notes:note,source_meal_ingredient_id:ingredient.id}).select('id,label,quantity,unit,is_done,notes,sort_order,source_meal_ingredient_id').single(); const { data, status } = result; const error = mutationProblem(result); if(error||!data){reportMutationError(error,'No se pudo enviar el faltante a compras.');return;}setLists(cur=>cur.map((row:any)=>row.id===list.id?{...row,list_items:[...(row.list_items||[]),data]}:row));reportMutationSuccess(mutationNotice(status, 'Faltante agregado a compras.'));if(status!==202)router.refresh(); }
  async function removeMeal(id: string) { if (!canEdit || !confirmRemoval('esta comida')) return; const previous=meals; setMeals((current) => current.filter((item) => item.id !== id)); const result = await supabase.from("meals").delete().eq("id", id).eq("camporee_id",camporeeId).select("id").single(); const error=mutationProblem(result,[id]);const status=result.status; if (error){setMeals(previous);reportMutationError(error,'No se pudo eliminar la comida.');}else{reportMutationSuccess(mutationNotice(status, 'Comida eliminada.'));if(status!==202)router.refresh();} }

  const mealIcon = (type:string) => type==='breakfast'||type==='snack_am'?<Coffee size={21}/>:type==='lunch'?<Utensils size={21}/>:<Soup size={21}/>;
  const formatDate = (date:string) => new Date(`${date}T00:00:00`).toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long'});

  return <>
    <div className="pm-date-chips">{dates.map((date,index)=><button type="button" key={date} className={activeDate===date?'active':''} onClick={()=>{setSelectedDate(date);setSelectedMeal(null)}}>Día {index+1} · {new Date(`${date}T00:00:00`).toLocaleDateString('es-DO',{day:'numeric',month:'short'})}</button>)}</div>
    {activeDate?<p className="pm-date-label">{formatDate(activeDate)}</p>:null}
    <BottomSheet open={Boolean(open)} onClose={closeMeal} title={<>{editing ? "Editar comida" : "Nueva comida"}</>} busy={saving}><form onSubmit={(event)=>{event.preventDefault();void saveMeal(new FormData(event.currentTarget));}} className="panel-form pm-sheet-form"><div className="pm-sheet-fields">{formError?<div className="auth-alert error" role="alert">{formError}</div>:null}<div className="form-two"><label className="pm-field"><span>Fecha <b className="pm-required">*</b></span><input name="meal_date" type="date" defaultValue={editing?.meal_date || ""} required/></label><label className="pm-field"><span>Comida</span><select name="meal_type" defaultValue={editing?.meal_type || "breakfast"}>{mealTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="pm-field"><span>Menú <b className="pm-required">*</b></span><textarea name="menu"  defaultValue={editing?.menu || ""} required/></label><label className="pm-field"><span>Responsable</span><input name="responsible_name"  defaultValue={editing?.responsible_name || ""}/></label><label className="pm-field"><span>Notas</span><textarea name="notes"  defaultValue={editing?.notes || ""}/></label></div><div className="pm-sheet-footer"><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div></form></BottomSheet>
    <BottomSheet open={Boolean(ingredientFor)} onClose={()=>setIngredientFor(null)} title={<>Agregar ingrediente</>} busy={saving}><form onSubmit={(event)=>{event.preventDefault();void addIngredient(new FormData(event.currentTarget));}} className="panel-form pm-sheet-form"><div className="pm-sheet-fields"><label className="pm-field"><span>Nombre <b className="pm-required">*</b></span><input name="name"  required/></label><div className="form-two"><label className="pm-field"><span>Cantidad</span><input name="required_quantity" type="number" min="0" step="0.01" defaultValue="1"/></label><label className="pm-field"><span>Unidad</span><input name="unit" /></label></div><label className="pm-field"><span>Artículo del inventario</span><select name="inventory_item_id" defaultValue=""><option value="">No vincular al inventario</option>{inventory.map((item:any)=><option key={item.id} value={item.id}>{item.name} · {item.quantity} {item.unit||''}</option>)}</select></label></div><div className="pm-sheet-footer"><button type="submit" className="primary-btn">Agregar ingrediente</button></div></form></BottomSheet>

    <section className="pm-meal-list">{visible.length?visible.map(meal=>{const missing=(meal.meal_ingredients||[]).filter((ingredient:any)=>shortage(ingredient)>0).length;return <article className="pm-meal-card" key={meal.id}><button type="button" className="pm-meal-main" onClick={()=>setSelectedMeal(selectedMeal===meal.id?null:meal.id)}><span className="pm-meal-icon">{mealIcon(meal.meal_type)}</span><span className="pm-meal-copy"><small>{mealLabel(meal.meal_type)} · {(meal.meal_ingredients||[]).length} ingredientes</small><strong>{meal.menu}</strong><span className="pm-meal-pills">{meal.responsible_name?<em>{meal.responsible_name}</em>:null}{missing?<em className="pm-missing">{missing} faltantes</em>:null}</span></span></button><BottomSheet open={selectedMeal===meal.id} onClose={()=>setSelectedMeal(null)} title={meal.menu} description={`${mealLabel(meal.meal_type)} · ${meal.meal_date} · ${meal.responsible_name || ""}`} ><div className="pm-meal-detail"><div className="pm-meal-detail-head"><strong>Ingredientes</strong>{canEdit?<div><button type="button" onClick={()=>openEdit(meal)} aria-label="Editar comida"><Pencil size={16}/></button><button type="button" onClick={()=>removeMeal(meal.id)} aria-label="Eliminar comida"><Trash2 size={16}/></button></div>:null}</div>{(meal.meal_ingredients||[]).map((ingredient:any)=>{const missing=shortage(ingredient);const mismatch=allocation.get(ingredient.id)?.mismatch;const stock=ingredient.inventory_item_id?inventoryMap.get(ingredient.inventory_item_id):null;return <div className="pm-ingredient" key={ingredient.id}><PackageCheck size={17}/><div><strong>{ingredient.name}</strong><small>Necesitas {ingredient.required_quantity} {ingredient.unit||''}{stock?` · Hay ${stock.quantity} ${stock.unit||''}`:''}</small></div>{mismatch?<span className="pm-missing">Unidades incompatibles · verificar cantidad</span>:missing>0?<span className="pm-missing">Faltan {missing} {ingredient.unit||''}</span>:<span className="pm-complete">Completo</span>}{missing>0&&!mismatch&&canEditLists?<button type="button" disabled={generatedIngredientIds.has(ingredient.id)} onClick={()=>addShortageToShopping(meal,ingredient)} aria-label="Agregar a compras"><ShoppingCart size={15}/></button>:null}{canEdit?<button type="button" onClick={()=>removeIngredient(meal.id,ingredient.id)} aria-label="Eliminar ingrediente"><Trash2 size={15}/></button>:null}</div>})}{canEdit?<button type="button" className="pm-add-ingredient" onClick={()=>setIngredientFor(meal)}><Plus size={16}/> Agregar ingrediente</button>:null}</div></BottomSheet></article>}) : <div className="empty compact">{meals.length?'No hay comidas para este día.':'No hay comidas planificadas todavía.'}</div>}</section>
    {canEdit?<button type="button" className="pm-fab" onClick={openNew}><Plus size={20}/> Comida</button>:null}
  </>;
}
