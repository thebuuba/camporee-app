'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type OrganizationActionResult =
  | {ok:true; organizationId?:string; camporeeId?:string; invitationToken?:string; joinCode?:string}
  | {ok:false; error:string};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULES=['tasks','schedule','participants','finances','meals','notes','lists','inventory','settings','edit'] as const;
const field=(form:FormData,key:string)=>String(form.get(key)??'').trim();
const validName=(value:string)=>value.length>=2&&value.length<=120;

async function callRpc(name:string,args:Record<string,unknown>):Promise<{ok:true;value:string}|{ok:false;error:string}> {
  try {
    const supabase=await createClient();
    const auth=await supabase.auth.getUser();
    if(auth.error||!auth.data.user)return {ok:false,error:'Tu sesión expiró. Vuelve a iniciar sesión.'};
    // Identity and permissions are checked again inside the transactional RPC.
    const result=await supabase.rpc(name,args);
    if(result.error)return {ok:false,error:result.error.code==='23505'
      ?'Esta cuenta ya pertenece a un club, o el camporee ya está creado. Solo puedes tener un club y un camporee vigente.'
      :result.error.code==='42501'?'No tienes acceso o tu correo todavía no está confirmado.':result.error.message};
    if(result.data===null&&name==='join_camporee_by_code')
      return {ok:false,error:'Ese código no corresponde a un camporee vigente. Comprueba los cuatro dígitos.'};
    if(typeof result.data!=='string')return {ok:false,error:'No pudimos confirmar el resultado. Actualiza la pantalla antes de reintentar.'};
    return {ok:true,value:result.data};
  } catch { return {ok:false,error:'No se pudo conectar. Conserva los datos del formulario e inténtalo de nuevo.'}; }
}

export async function createOrganization(form:FormData):Promise<OrganizationActionResult> {
  const name=field(form,'name'),id=field(form,'requestId');
  if(!validName(name)||!UUID.test(id))return {ok:false,error:'Escribe un nombre de 2 a 120 caracteres.'};
  const result=await callRpc('create_organization',{organization_name:name,organization_uuid:id});
  if(!result.ok)return result;
  revalidatePath('/organizations');
  return {ok:true,organizationId:result.value};
}
export async function createCamporee(form:FormData):Promise<OrganizationActionResult> {
  const org=field(form,'organizationId'),id=field(form,'requestId'),name=field(form,'name');
  const start=field(form,'startsOn'),end=field(form,'endsOn');
  if(!UUID.test(org)||!UUID.test(id)||!validName(name)||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)return {ok:false,error:'Revisa el nombre y las fechas del camporee.'};
  const currency=(field(form,'currency')||'DOP').toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency))return {ok:false,error:'Selecciona una moneda válida.'};
  const result=await callRpc('create_camporee',{
    target_organization:org,camporee_uuid:id,camporee_name:name,start_date:start,end_date:end,
    camporee_location:field(form,'location')||null,camporee_theme:null,
    camporee_currency:currency,camporee_time_zone:field(form,'timeZone')||'America/Santo_Domingo',
  });
  if(!result.ok)return result;
  // The database trigger creates BOTH invitations during camporee insertion.
  // Read them back before reporting success; a retry uses the same request UUID.
  const supabase=await createClient();
  const invitation=await supabase.rpc('read_camporee_invitation',{target_camporee:result.value});
  if(invitation.error || !invitation.data || typeof invitation.data!=='object') {
    return {ok:false,error:'El camporee se creó, pero no se pudo consultar su invitación. Pulsa Crear otra vez sin cambiar los datos.'};
  }
  const detail=invitation.data as {code?:unknown;token?:unknown};
  if(typeof detail.code!=='string'||!/^[0-9]{4}$/.test(detail.code)||
     typeof detail.token!=='string'||!/^[a-f0-9]{64}$/.test(detail.token)) {
    return {ok:false,error:'La invitación todavía no está lista. Reintenta con los mismos datos.'};
  }
  revalidatePath(`/o/${org}`);
  return {ok:true,organizationId:org,camporeeId:result.value,joinCode:detail.code,invitationToken:detail.token};
}
export async function createInvitation(form:FormData):Promise<OrganizationActionResult> {
  const org=field(form,'organizationId'),email=field(form,'email').toLowerCase(),role=field(form,'role')||'viewer';
  if(!UUID.test(org)||!/^\S+@\S+\.\S+$/.test(email)||!['admin','editor','viewer'].includes(role))return {ok:false,error:'Revisa el correo y el rol de la invitación.'};
  const permissions=Object.fromEntries(MODULES.map(module=>[module,form.get(module)==='on']));
  if(field(form,'directiveRole').length>80)return {ok:false,error:'El cargo no puede superar 80 caracteres.'};
  const result=await callRpc('create_organization_invitation',{
    target_organization:org,invited_email:email,invited_role:role,invited_permissions:permissions,invited_directive_role:field(form,'directiveRole')||null,
  });
  if(!result.ok)return result;
  return {ok:true,invitationToken:result.value};
}
export async function joinCamporee(form:FormData):Promise<OrganizationActionResult> {
  const code=field(form,'code').trim();
  if(!/^[0-9]{4}$/.test(code))return {ok:false,error:'Introduce el código numérico de cuatro dígitos.'};
  const result=await callRpc('join_camporee_by_code',{join_code:code});
  if(!result.ok)return result;
  if(!result.value)return {ok:false,error:'Código incorrecto. Compruébalo antes de volver a intentar.'};
  revalidatePath('/');
  return {ok:true,camporeeId:result.value};
}
export async function createJoinCode(form:FormData):Promise<OrganizationActionResult> {
  const camporeeId=field(form,'camporeeId');
  if(!UUID.test(camporeeId))return {ok:false,error:'Camporee inválido.'};
  const result=await callRpc('create_camporee_join_code',{target_camporee:camporeeId});
  if(!result.ok)return result;
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('read_camporee_invitation',{target_camporee:camporeeId});
  if(error||!data||typeof data.code!=='string'||typeof data.token!=='string')
    return {ok:false,error:'No pudimos obtener el enlace de invitación. Actualiza la pantalla.'};
  revalidatePath('/more/users');
  return {ok:true,joinCode:data.code,invitationToken:data.token};
}
export async function acceptInvitation(form:FormData):Promise<OrganizationActionResult> {
  const token=field(form,'token');
  if(!/^[a-f0-9]{64}$/.test(token))return {ok:false,error:'El enlace de invitación no es válido.'};
  const result=await callRpc('accept_organization_invitation',{invitation_token:token});
  if(!result.ok)return result;
  revalidatePath('/organizations');
  return {ok:true,organizationId:result.value};
}
