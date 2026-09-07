import Link from "next/link";
import { LockKeyhole, Mail, UserRound } from "lucide-react";
import { signup } from "../login/actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className="auth-shell auth-shell-clean">
    <section className="auth-wrap">
      <div className="auth-brand-row"><div className="brand-badge brand-image"><img src="/camporee-home-icon-v2.png" alt="Camporee" width="54" height="54" /></div><div><div className="eyebrow">CAMPOREE</div><strong>Club de Conquistadores</strong></div></div>
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