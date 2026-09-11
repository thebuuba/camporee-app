'use server';

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PERMISSION_KEYS = ["tasks","schedule","participants","finances","meals","notes","lists","inventory","settings"] as const;

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
  if (!targetUserId || !["admin","editor","viewer"].includes(role)) {
    return { ok:false, error:"Los datos del usuario no son válidos." };
  }

  if (targetUserId === currentUserId && (role !== "admin" || !isActive)) {
    return { ok:false, error:"No puedes quitarte tu propio acceso de administrador." };
  }

  const permissions: Record<string, boolean> = {};
  for (const key of PERMISSION_KEYS) permissions[key] = formData.get(key) === "on";

  const { error } = await supabase.from("app_members").update({
    role,
    is_active: isActive,
    permissions,
    updated_at: new Date().toISOString(),
  }).eq("user_id", targetUserId);

  if (error) return { ok:false, error:"No se pudieron guardar los permisos." };

  revalidatePath("/more/users");
  revalidatePath("/more");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/program");

  return { ok:true };
}
