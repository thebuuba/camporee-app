import Link from '@/app/components/tenant-link';
import { ChevronLeft } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import MealManager from "./meal-manager";

export default async function MealsPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/meals');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('meals');
  const canEditLists = context.canEdit('lists');

  const [{ data: meals, error: mealsError }, { data: inventory, error: inventoryError }, { data: lists, error: listsError }] = camporee ? await Promise.all([
    supabase.from("meals").select("id,meal_date,meal_type,menu,responsible_name,notes,meal_ingredients(id,name,required_quantity,unit,inventory_item_id)").eq("camporee_id", camporee.id).order("meal_date").order("meal_type"),
    supabase.from("inventory_items").select("id,name,quantity,unit").eq("camporee_id", camporee.id).order("name"),
    supabase.from("lists").select("id,title,category,list_items(id,source_meal_ingredient_id,is_done)").eq("camporee_id", camporee.id).order("created_at"),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const contentError = mealsError ?? inventoryError ?? listsError;
  if (contentError) throw contentError;

  return <main className="app panel-page polymet-panel polymet-meals"><header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver"><ChevronLeft size={21}/></Link><div><h1>Comidas</h1><small>Plan de alimentación</small></div></header>{camporee ? <MealManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} canEdit={canEdit} canEditLists={canEditLists} initialMeals={meals ?? []} inventory={inventory ?? []} initialLists={lists ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}</main>;
}
