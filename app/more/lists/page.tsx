import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ListManager from "./list-manager";

export default async function ListsPage() {
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
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.lists);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];
  const { data: lists } = camporee ? await supabase.from("lists").select("id,title,category,list_items(id,label,quantity,unit,is_done,notes,sort_order)").eq("camporee_id", camporee.id).order("created_at") : { data: [] };
  return <main className="app panel-page"><header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">LOGÍSTICA</div><h1>Listas</h1></div><span className="avatar"><ListChecks size={22}/></span></header><div className="panel-intro"><div><strong>{lists?.length ?? 0} listas</strong><small>Compras, materiales, equipaje y pendientes.</small></div></div>{camporee ? <ListManager camporeeId={camporee.id} canEdit={canEdit} initialLists={lists ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}</main>;
}
