'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PERMISSION_KEYS = ["tasks","schedule","participants","finances","meals","notes","lists","inventory","settings"] as const;

export async function updateMemberAccess(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = claimsData?.claims?.sub;
  if (!currentUserId) redirect("/login");

  const { data: currentMembership } = await supabase.from("app_members").select("role,is_active").eq("user_id", currentUserId).maybeSingle();
  if (!currentMembership?.is_active || currentMembership.role !== "admin") redirect("/");

  const targetUserId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "viewer");
  const isActive = formData.get("isActive") === "on";
  if (!targetUserId || !["admin","editor","viewer"].includes(role)) redirect("/more/users?error=Datos%20inválidos");

  if (targetUserId === currentUserId && (role !== "admin" || !isActive)) {
    redirect("/more/users?error=No%20puedes%20quitarte%20tu%20propio%20acceso%20de%20administrador");
  }

  const permissions: Record<string, boolean> = {};
  for (const key of PERMISSION_KEYS) permissions[key] = formData.get(key) === "on";

  const { error } = await supabase.from("app_members").update({ role, is_active: isActive, permissions, updated_at: new Date().toISOString() }).eq("user_id", targetUserId);
  if (error) redirect(`/more/users?error=${encodeURIComponent("No se pudieron guardar los permisos")}`);

  revalidatePath("/more/users");
  revalidatePath("/more");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/program");
  redirect("/more/users?saved=1");
}
