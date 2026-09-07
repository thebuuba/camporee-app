'use server';

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect(`/login?error=${encodeURIComponent("Completa tu correo y contraseña")}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent("Correo o contraseña incorrectos")}`);
  redirect("/");
}

export async function signup(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (fullName.length < 2) redirect(`/signup?error=${encodeURIComponent("Escribe tu nombre")}`);
  if (!email) redirect(`/signup?error=${encodeURIComponent("Escribe un correo válido")}`);
  if (password.length < 8) redirect(`/signup?error=${encodeURIComponent("La contraseña debe tener al menos 8 caracteres")}`);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) redirect(`/signup?error=${encodeURIComponent("Usa al menos una letra y un número en la contraseña")}`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) {
    const message = error.message.toLowerCase().includes("already") ? "Ya existe una cuenta con ese correo" : error.message;
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }
  if (!data.session) redirect(`/login?message=${encodeURIComponent("Cuenta creada. Ya puedes iniciar sesión.")}`);
  redirect("/");
}