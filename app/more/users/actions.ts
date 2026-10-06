'use server';

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PERMISSION_KEYS = ["tasks","schedule","participants","finances","meals","notes","lists","inventory","settings"] as const;

export async function rejectMemberAccess(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const currentUserId = data?.claims?.sub;
  if (!currentUserId) return { ok:false, error:"Tu sesión expiró. Vuelve a iniciar sesión." };
  const { data: me, error: meError } = await supabase.from('app_members').select('role,is_active').eq('user_id', currentUserId).maybeSingle();
  if (meError || !me?.is_active || me.role !== 'admin') return { ok:false, error:"No tienes permiso para rechazar solicitudes." };
  const targetUserId = String(formData.get('userId') ?? '');
  if (!targetUserId || targetUserId === currentUserId) return { ok:false, error:"No puedes rechazar tu propia cuenta." };
  const { data: target, error: targetError } = await supabase.from('app_members').select('is_active,permissions').eq('user_id', targetUserId).maybeSingle();
  if (targetError || !target || target.is_active) return { ok:false, error:"Esta cuenta ya no tiene una solicitud pendiente." };
  // Rejection is an access decision, not deletion of the Auth account.
  const { data: updated, error } = await supabase.from('app_members').update({
    is_active:false,
    permissions:{ ...target.permissions, access_rejected:true },
    updated_at:new Date().toISOString(),
  }).eq('user_id', targetUserId).eq('is_active', false).select('user_id').maybeSingle();
  if (error || !updated) return { ok:false, error:"No se pudo rechazar la solicitud. Actualiza la pantalla e inténtalo otra vez." };
  revalidatePath('/more/users');
  revalidatePath('/more');
  revalidatePath('/');
  return { ok:true };
}

export async function updateMemberAccess(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = claimsData?.claims?.sub;
  if (!currentUserId) return { ok:false, error:"Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: currentMembership, error: membershipError } = await supabase.from("app_members").select("role,is_active").eq("user_id", currentUserId).maybeSingle();
  if (membershipError || !currentMembership?.is_active || currentMembership.role !== "admin") {
    return { ok:false, error:"No tienes permiso para modificar usuarios." };
  }

  const targetUserId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "viewer");
  const isActive = formData.get("isActive") === "on";
  const directiveRole = String(formData.get("directiveRole") ?? "").trim();
  if (directiveRole.length > 80) return { ok:false, error:"El cargo no puede superar 80 caracteres." };
  if (!targetUserId || !["admin","editor","viewer"].includes(role)) {
    return { ok:false, error:"Los datos del usuario no son válidos." };
  }

  if (targetUserId === currentUserId && (role !== "admin" || !isActive)) {
    return { ok:false, error:"No puedes quitarte tu propio acceso de administrador." };
  }

  const permissions: Record<string, boolean> = {};
  for (const key of PERMISSION_KEYS) permissions[key] = formData.get(key) === "on";

  const request = supabase.from("app_members").update({
    role,
    ...(formData.has('directiveRole') ? { directive_role: directiveRole || null } : {}),
    is_active: isActive,
    permissions,
    updated_at: new Date().toISOString(),
  }).eq("user_id", targetUserId);

  if (formData.get('approvePending') === 'on') {
    const { data: updated, error } = await request.eq('is_active', false)
      .or('permissions->>access_rejected.is.null,permissions->>access_rejected.neq.true')
      .select('user_id').maybeSingle();
    if (error || !updated) return { ok:false, error:"La solicitud cambió o ya fue rechazada. Actualiza la pantalla." };
  } else {
    const { error } = await request;
    if (error) return { ok:false, error:"No se pudieron guardar los permisos." };
  }

  revalidatePath("/more/users");
  revalidatePath("/more");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/program");

  return { ok:true };
}
