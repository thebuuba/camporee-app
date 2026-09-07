'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_AREAS = [
  ["Alimentación","🍲"],["Campamento","⛺"],["Transporte","🚌"],["Equipaje","🎒"],
  ["Finanzas","💰"],["Salud","🩹"],["Espiritual","🙏"],["Actividades","🎯"],
  ["Administración","📋"],["Compras","🛒"]
] as const;

export async function createCamporee(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsOn = String(formData.get("startsOn") ?? "");
  const endsOn = String(formData.get("endsOn") ?? "");

  if (!name || !startsOn || !endsOn) redirect("/?error=Completa%20los%20datos%20del%20camporee");

  const { data: camporee, error } = await supabase.from("camporees").insert({
    owner_id: userId,
    name,
    location: location || null,
    starts_on: startsOn,
    ends_on: endsOn,
  }).select("id").single();

  if (error || !camporee) redirect(`/?error=${encodeURIComponent(error?.message ?? "No se pudo crear el camporee")}`);

  await supabase.from("camporee_members").insert({ camporee_id: camporee.id, user_id: userId, role: "admin" });
  await supabase.from("areas").insert(DEFAULT_AREAS.map(([areaName, icon], index) => ({ camporee_id: camporee.id, name: areaName, icon, sort_order: index })));

  revalidatePath("/");
  redirect("/");
}