import Link from "next/link";
import { Check, LockKeyhole, Mail, UserRound } from "lucide-react";
import { signup } from "../login/actions";
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
  return <main className="auth-shell auth-shell-clean">
    <section className="auth-wrap">
      <div className="auth-brand-row"><div className="brand-badge brand-image"><img src="/camporee-logo-v8.png" alt="Camporee" width="54" height="54" /></div><div><div className="eyebrow">CAMPOREE</div><strong>Club de Conquistadores</strong></div></div>
      <section className="auth-card auth-card-ios">
        <div className="auth-heading"><span className="auth-kicker">ÚNETE AL EQUIPO</span><h1>Solicita acceso al camporee.</h1><p className="auth-copy">Crea tu cuenta y un administrador revisará la solicitud. La información del equipo permanecerá protegida hasta que active tu acceso.</p></div>
        {params.error ? <div className="auth-alert error">{params.error}</div> : null}
        <form className="auth-form auth-form-ios">
          <label>Nombre completo<div className="field-card"><span><UserRound size={17}/></span><input name="fullName" type="text" autoComplete="name" placeholder="Tu nombre" required /></div></label>
          <label>Correo<div className="field-card"><span><Mail size={17}/></span><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" required /></div></label>
          <label>Contraseña<div className="field-card"><span><LockKeyhole size={17}/></span><input name="password" type="password" autoComplete="new-password" placeholder="8+ caracteres, letra y número" minLength={8} required /></div></label>
          <button className="primary-btn auth-primary" formAction={signup}>Crear mi acceso</button>
        </form>
        <div className="auth-divider"><span>¿Ya tienes cuenta?</span></div><Link className="secondary-btn auth-link-btn" href="/login">Volver a iniciar sesión</Link>
      </section>
      <p className="auth-footnote">Después de crear la cuenta, un administrador deberá activar tu acceso.</p>
    </section>
  </main>;
}
