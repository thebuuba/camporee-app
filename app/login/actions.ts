'use server';

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeAuthReturn } from "@/lib/tenant-context";

export async function login(formData: FormData) {
  const returnTo = safeAuthReturn(formData.get('next'));
  const nextQuery = returnTo === '/' ? '' : `&next=${encodeURIComponent(returnTo)}`;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect(`/login?error=${encodeURIComponent("Completa tu correo y contraseña")}${nextQuery}`);
  const cookieStore = await cookies();
  cookieStore.set("camporee-remember", formData.get("remember") === "on" ? "yes" : "no", { httpOnly: true, sameSite: "lax", path: "/", ...(formData.get("remember") === "on" ? { maxAge: 60 * 60 * 24 * 365 } : {}) });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) redirect(`/login?error=${encodeURIComponent("Correo o contraseña incorrectos")}${nextQuery}`);
  const { data: verified } = await supabase.auth.getUser();
  if (!verified.user) redirect(`/login?error=${encodeURIComponent("No se pudo iniciar la sesión. Inténtalo otra vez.")}${nextQuery}`);
  revalidatePath("/", "layout");
  const destination = new URL(returnTo, 'https://camporee.invalid');
  destination.searchParams.set('login','ok');
  redirect(`${destination.pathname}${destination.search}`);
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
  const returnTo = safeAuthReturn(formData.get('next'));
  const nextQuery = returnTo === '/' ? '' : `&next=${encodeURIComponent(returnTo)}`;
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (fullName.length < 2) redirect(`/signup?error=${encodeURIComponent("Escribe tu nombre")}${nextQuery}`);
  if (!email) redirect(`/signup?error=${encodeURIComponent("Escribe un correo válido")}${nextQuery}`);
  if (password.length < 8) redirect(`/signup?error=${encodeURIComponent("La contraseña debe tener al menos 8 caracteres")}${nextQuery}`);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) redirect(`/signup?error=${encodeURIComponent("Usa al menos una letra y un número en la contraseña")}${nextQuery}`);

  const supabase = await createClient();
  const { data: existingAuth, error: existingAuthError } = await supabase.auth.getClaims();
  if (existingAuth?.claims?.sub) redirect(`/signup?error=${encodeURIComponent("Ya tienes una sesión abierta. Para registrar otra cuenta usa otro navegador o cierra tu sesión primero.")}${nextQuery}`);
  if (existingAuthError && existingAuthError.name !== 'AuthSessionMissingError') redirect(`/signup?error=${encodeURIComponent("No pudimos verificar la sesión. Inténtalo de nuevo.")}${nextQuery}`);
  // Preserve the invite destination on the SAME host where signup began.
  // NEXT_PUBLIC_SITE_URL may target production while the director is testing
  // this branch on localhost or a Cloudflare preview URL.
  const requestHeaders=await headers();
  const requestOrigin=requestHeaders.get('origin');
  const requestHost=requestHeaders.get('x-forwarded-host')||requestHeaders.get('host');
  let origin=process.env.NEXT_PUBLIC_SITE_URL||undefined;
  try {
    if(requestOrigin&&requestHost){
      const parsed=new URL(requestOrigin);
      if(parsed.host===requestHost &&
        (parsed.protocol==='https:' || (parsed.protocol==='http:' &&
          ['localhost','127.0.0.1'].includes(parsed.hostname)))){
        origin=parsed.origin;
      }
    }
  } catch { /* use configured site URL */ }
  const callback=origin?new URL(`/auth/confirm?next=${encodeURIComponent(returnTo)}`,origin).toString():undefined;
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, ...(callback ? { emailRedirectTo: callback } : {}) } });
  if (error) {
    const message = error.message.toLowerCase().includes("already") ? "Ya existe una cuenta con ese correo" : error.message;
    redirect(`/signup?error=${encodeURIComponent(message)}${nextQuery}`);
  }
  if (!data.session) redirect(`/signup?created=1&confirm=1${nextQuery}`);
  revalidatePath("/", "layout");
  // When email confirmation is disabled, Supabase creates a session at once:
  // automatically redeem the invite instead of requiring a Continue click.
  if(/^\/join\/[a-f0-9]{64}$/i.test(returnTo))redirect(returnTo);
  redirect(`/signup?created=1${nextQuery}`);
}
