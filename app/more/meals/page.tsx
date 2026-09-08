import Link from "next/link";
import { redirect } from "next/navigation";
import { Utensils } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import MealManager from "./meal-manager";

export default async function MealsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");
  const [{ data: membership, error: membershipError }, { data: camporees, error: camporeesError }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,status").order("starts_on", { ascending: true }),
  ]);
  if (membershipError || camporeesError) throw membershipError ?? camporeesError;
  if (!membership?.is_active) redirect("/");
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const elevated = membership.role === "admin" || membership.role === "editor";
  const canEdit = elevated || Boolean(permissions.meals);
  const canEditLists = elevated || Boolean(permissions.lists);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];

  const [{ data: meals, error: mealsError }, { data: inventory, error: inventoryError }, { data: lists, error: listsError }] = camporee ? await Promise.all([
    supabase.from("meals").select("id,meal_date,meal_type,menu,responsible_name,notes,meal_ingredients(id,name,required_quantity,unit,inventory_item_id)").eq("camporee_id", camporee.id).order("meal_date").order("meal_type"),
    supabase.from("inventory_items").select("id,name,quantity,unit").eq("camporee_id", camporee.id).order("name"),
    supabase.from("lists").select("id,title,category,list_items(id,source_meal_ingredient_id,is_done)").eq("camporee_id", camporee.id).order("created_at"),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const contentError = mealsError ?? inventoryError ?? listsError;
  if (contentError) throw contentError;

  return <main className="app panel-page"><header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">ALIMENTACIÓN</div><h1>Comidas</h1></div><span className="avatar"><Utensils size={22}/></span></header><div className="panel-intro"><div><strong>{meals?.length ?? 0} comidas</strong><small>Menú, ingredientes, existencias y compras faltantes.</small></div></div>{camporee ? <MealManager camporeeId={camporee.id} canEdit={canEdit} canEditLists={canEditLists} initialMeals={meals ?? []} inventory={inventory ?? []} initialLists={lists ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}</main>;
}
