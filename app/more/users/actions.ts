'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isTenantId } from '@/lib/tenant-context';

const PERMISSION_KEYS = ['tasks','schedule','participants','finances','meals','notes','lists','inventory','settings','edit'] as const;

async function memberRpc(form:FormData,name:string,args:Record<string,unknown>) {
  const organizationId=String(form.get('organizationId')??'');
  if(!isTenantId(organizationId))return {ok:false,error:'La organización no es válida.'};
  try {
    const supabase=await createClient();
    const auth=await supabase.auth.getUser();
    if(auth.error || !auth.data.user)return {ok:false,error:'Tu sesión expiró. Vuelve a iniciar sesión.'};
    const {error}=await supabase.rpc(name,{target_organization:organizationId,...args});
    if(error)return {ok:false,error:error.code==='42501'?'No tienes permiso para administrar esta organización.':error.code==='23514'?'La solicitud cambió o el propietario necesita conservar su acceso. Actualiza la pantalla.':'No se pudo guardar el cambio.'};
    revalidatePath(`/o/${organizationId}`,'layout');
    revalidatePath('/organizations');
    return {ok:true};
  }catch{return {ok:false,error:'No se pudo conectar. Tus cambios no se guardaron.'};}
}

export async function rejectMemberAccess(form:FormData) {
  const target=String(form.get('userId')??'');
  if(!isTenantId(target))return {ok:false,error:'El usuario no es válido.'};
  return memberRpc(form,'decide_organization_access',{target_user:target,decision:'reject'});
}

export async function updateMemberAccess(form:FormData) {
  const target=String(form.get('userId')??'');
  const role=String(form.get('role')??'viewer');
  const directiveRole=String(form.get('directiveRole')??'').trim();
  if(!isTenantId(target)||!['admin','editor','viewer'].includes(role))return {ok:false,error:'Los datos del usuario no son válidos.'};
  if(directiveRole.length>80)return {ok:false,error:'El cargo no puede superar 80 caracteres.'};
  if(form.get('approvePending')==='on')return memberRpc(form,'decide_organization_access',{target_user:target,decision:'approve'});
  const permissions:Record<string,boolean>={};
  for(const key of PERMISSION_KEYS)permissions[key]=form.get(key)==='on';
  return memberRpc(form,'update_organization_member',{
    target_user:target,member_role:role,member_permissions:permissions,
    member_active:form.get('isActive')==='on',member_directive_role:directiveRole||null,
  });
}

export async function removeMemberAccess(form:FormData) {
  const target=String(form.get('userId')??'');
  if(!isTenantId(target))return {ok:false,error:'El usuario no es válido.'};
  return memberRpc(form,'remove_organization_member',{target_user:target});
}

export async function revokeInvitation(form:FormData) {
  const id=String(form.get('invitationId')??'');
  if(!isTenantId(id))return {ok:false,error:'La invitación no es válida.'};
  return memberRpc(form,'revoke_organization_invitation',{invitation_id:id});
}

export async function transferOwnership(form:FormData) {
  const id=String(form.get('newOwner')??'');
  if(!isTenantId(id))return {ok:false,error:'Selecciona un administrador.'};
  return memberRpc(form,'transfer_organization_ownership',{new_owner:id});
}
