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
  const [{ data: membership }, { data: camporees }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,status").order("starts_on", { ascending: true }),
  ]);
  if (!membership?.is_active) redirect("/login");
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.meals);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];
  const { data: meals } = camporee ? await supabase.from("meals").select("id,meal_date,meal_type,menu,responsible_name,notes").eq("camporee_id", camporee.id).order("meal_date").order("meal_type") : { data: [] };
  return <main className="app panel-page"><header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">ALIMENTACIÓN</div><h1>Comidas</h1></div><span className="avatar"><Utensils size={22}/></span></header><div className="panel-intro"><div><strong>{meals?.length ?? 0} comidas</strong><small>Menú, día y responsable de cada comida.</small></div></div>{camporee ? <MealManager camporeeId={camporee.id} canEdit={canEdit} initialMeals={meals ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}</main>;
}
