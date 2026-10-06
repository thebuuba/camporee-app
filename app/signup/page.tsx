import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";
import { signup } from "../login/actions";
import PasswordField from "../login/password-field";
import { createClient } from "@/lib/supabase/server";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string; confirm?: string }> }) {
  const params = await searchParams;
  if (params.created === "1") {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
    const needsLogin = !data?.claims?.sub;
    return <main className="account-status-shell account-created-shell">
      <section className="account-created-content" aria-labelledby="account-created-title">
        <div className="account-status-icon"><Check size={44} strokeWidth={3} aria-hidden="true" /></div>
        <h1 id="account-created-title">¡Cuenta creada!</h1>
        <p>Un administrador debe aprobar tu cuenta antes de que puedas entrar.{email ? <> Tu solicitud está registrada con <strong>{email}</strong>.</> : null}</p>
        {params.confirm === "1" && needsLogin ? <p>Revisa tu correo para confirmar la cuenta y después inicia sesión para ver tu solicitud.</p> : null}
        <Link className="account-status-primary" href={needsLogin ? "/login" : "/"}>Ver estado de mi solicitud</Link>
        <form action="/auth/signout" method="post"><button className="account-status-text">Volver al inicio de sesión</button></form>
      </section>
    </main>;
  }
  return <main className="pm-login-shell pm-signup-shell">
    <header className="pm-signup-header">
      <Link href="/login" aria-label="Volver al inicio de sesión"><ChevronLeft size={18} aria-hidden="true" /></Link>
      <div><h1>Crear cuenta</h1><p>Tus datos</p></div>
    </header>
    <section className="pm-signup-content" aria-label="Crear cuenta">
      {params.error ? <div className="auth-alert error" role="alert">{params.error}</div> : null}
      <form className="pm-login-form" action={signup}>
        <label className="pm-login-field">Nombre completo<div className="pm-login-input"><input name="fullName" type="text" autoComplete="name" placeholder="Tu nombre completo" minLength={2} required /></div></label>
        <label className="pm-login-field">Correo electrónico<div className="pm-login-input"><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" required /></div></label>
        <PasswordField newPassword />
        <button className="pm-login-submit">Crear cuenta</button>
      </form>
      <p className="pm-login-register">¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link></p>
    </section>
  </main>;
}
