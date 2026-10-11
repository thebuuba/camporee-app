import Link from '@/app/components/tenant-link';
import { ChevronLeft } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import InventoryManager from './inventory-manager';

export default async function InventoryPage({ params }: { params?: TenantPageParams } = {}) {
 const context = await requireCamporeeContext(params, '/more/inventory');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('inventory');
 const {data:items,error:itemsError}=camporee?await supabase.from('inventory_items').select('*').eq('camporee_id',camporee.id).order('created_at',{ascending:false}):{data:[],error:null};
 const contentError = itemsError;
  if (contentError) throw contentError;
 return <main className='app panel-page polymet-panel polymet-inventory'><header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver"><ChevronLeft size={21}/></Link><div><h1>Inventario</h1><small>Artículos registrados</small></div></header>{camporee?<InventoryManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} canEdit={canEdit} initialItems={items??[]}/>:<div className='empty compact'>Todavía no hay un camporee activo.</div>}</main>
}
