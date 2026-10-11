import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import ListManager from "./list-manager";

export default async function ListsPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/lists');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('lists');
  const { data: lists, error: listsError } = camporee ? await supabase.from("lists").select("id,title,category,list_items(id,label,quantity,unit,is_done,notes,sort_order)").eq("camporee_id", camporee.id).order("created_at") : { data: [], error: null };
  const contentError = listsError;
  if (contentError) throw contentError;

  return <main className="app panel-page polymet-panel polymet-lists"><header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver"><ChevronLeft size={21}/></Link><div><h1>Listas</h1><small>Compras, equipaje y materiales</small></div></header>{camporee ? <ListManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} canEdit={canEdit} initialLists={lists ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}</main>;
}
