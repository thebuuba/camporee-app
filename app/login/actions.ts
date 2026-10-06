'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect(`/login?error=${encodeURIComponent("Completa tu correo y contraseña")}`);
  const cookieStore = await cookies();
  cookieStore.set("camporee-remember", formData.get("remember") === "on" ? "yes" : "no", { httpOnly: true, sameSite: "lax", path: "/", ...(formData.get("remember") === "on" ? { maxAge: 60 * 60 * 24 * 365 } : {}) });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) redirect(`/login?error=${encodeURIComponent("Correo o contraseña incorrectos")}`);
  const { data: verified } = await supabase.auth.getUser();
  if (!verified.user) redirect(`/login?error=${encodeURIComponent("No se pudo iniciar la sesión. Inténtalo otra vez.")}`);
  revalidatePath("/", "layout");
  redirect("/?login=ok");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`/login?error=${encodeURIComponent("Escribe tu correo para recuperar la contraseña.")}`);
  const origin = (await headers()).get("origin");
  if (!origin) redirect(`/login?error=${encodeURIComponent("No pudimos iniciar la recuperación. Inténtalo de nuevo.")}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL("/auth/confirm?next=recovery", origin).toString() });
  if (error) redirect(`/login?error=${encodeURIComponent("No pudimos enviar el enlace. Inténtalo de nuevo en unos minutos.")}`);
  redirect(`/login?message=${encodeURIComponent("Si el correo está registrado, recibirás un enlace para cambiar tu contraseña.")}`);
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) redirect(`/login?reset=1&error=${encodeURIComponent("Usa al menos 8 caracteres, una letra y un número.")}`);
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) redirect(`/login?error=${encodeURIComponent("El enlace ha caducado. Solicita uno nuevo.")}`);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/login?reset=1&error=${encodeURIComponent("No pudimos cambiar la contraseña. Inténtalo de nuevo.")}`);
  await supabase.auth.signOut();
  redirect(`/login?message=${encodeURIComponent("Contraseña actualizada. Ya puedes iniciar sesión.")}`);
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
  const { data: existingAuth, error: existingAuthError } = await supabase.auth.getClaims();
  if (existingAuth?.claims?.sub) redirect(`/signup?error=${encodeURIComponent("Ya tienes una sesión abierta. Para registrar otra cuenta usa otro navegador o cierra tu sesión primero.")}`);
  if (existingAuthError && existingAuthError.name !== 'AuthSessionMissingError') redirect(`/signup?error=${encodeURIComponent("No pudimos verificar la sesión. Inténtalo de nuevo.")}`);
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) {
    const message = error.message.toLowerCase().includes("already") ? "Ya existe una cuenta con ese correo" : error.message;
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }
  if (!data.session) redirect("/signup?created=1&confirm=1");
  revalidatePath("/", "layout");
  redirect("/signup?created=1");
}
