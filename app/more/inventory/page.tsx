import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackageCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import InventoryManager from './inventory-manager';

export default async function InventoryPage(){
 const supabase=await createClient(); const {data:auth}=await supabase.auth.getClaims(); const userId=auth?.claims?.sub; if(!userId)redirect('/login');
 const [{data:membership,error:membershipError},{data:camporees,error:camporeesError}]=await Promise.all([supabase.from('app_members').select('role,is_active,permissions').eq('user_id',userId).maybeSingle(),supabase.from('camporees').select('id,status').order('starts_on',{ascending:true})]);
 if(membershipError||camporeesError)throw membershipError??camporeesError;
 if(!membership?.is_active)redirect('/'); const permissions=(membership.permissions??{}) as Record<string,boolean>; const canEdit=membership.role==='admin'||membership.role==='editor'||Boolean(permissions.inventory); const camporee=camporees?.find(c=>c.status!=='archived')??camporees?.[0];
 const {data:items,error:itemsError}=camporee?await supabase.from('inventory_items').select('*').eq('camporee_id',camporee.id).order('created_at',{ascending:false}):{data:[],error:null};
 const contentError = itemsError;
  if (contentError) throw contentError;
 return <main className='app panel-page'><header className='subpage-top'><Link href='/more' className='back-btn' aria-label='Volver'>‹</Link><div><div className='eyebrow'>EQUIPO</div><h1>Inventario</h1></div><span className='avatar'><PackageCheck size={22}/></span></header><div className='panel-intro'><div><strong>Que nada se quede</strong><small>Controla qué sale al camporee y qué debe regresar.</small></div></div>{camporee?<InventoryManager camporeeId={camporee.id} canEdit={canEdit} initialItems={items??[]}/>:<div className='empty compact'>Todavía no hay un camporee activo.</div>}</main>
}
