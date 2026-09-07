import Link from "next/link";
import { LockKeyhole, Mail } from "lucide-react";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return <main className="auth-shell auth-shell-clean">
    <section className="auth-wrap">
      <div className="auth-brand-row"><div className="brand-badge brand-image"><img src="/camporee-logo-v8.png?v=9" alt="Camporee" width="54" height="54" /></div><div><div className="eyebrow">CAMPOREE</div><strong>Club de Conquistadores</strong></div></div>
      <section className="auth-card auth-card-ios">
        <div className="auth-heading"><span className="auth-kicker">BIENVENIDO</span><h1>Todo el camporee en un mismo lugar.</h1><p className="auth-copy">Entra al espacio compartido del equipo para organizar tareas, programa, participantes, comidas, listas y presupuesto.</p></div>
        {params.error ? <div className="auth-alert error">{params.error}</div> : null}{params.message ? <div className="auth-alert success">{params.message}</div> : null}
        <form className="auth-form auth-form-ios">
          <label>Correo<div className="field-card"><span><Mail size={18}/></span><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" required /></div></label>
          <label>Contraseña<div className="field-card"><span><LockKeyhole size={18}/></span><input name="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" minLength={6} required /></div></label>
          <button className="primary-btn auth-primary" formAction={login}>Entrar al camporee</button>
        </form>
        <div className="auth-divider"><span>¿Primera vez?</span></div><Link className="secondary-btn auth-link-btn" href="/signup">Crear una cuenta</Link>
      </section>
      <p className="auth-footnote">Pensado para usarlo rápido desde el teléfono, antes y durante la aventura.</p>
    </section>
  </main>;
}