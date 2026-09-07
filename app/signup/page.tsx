import Link from "next/link";
import { signup } from "../login/actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return <main className="auth-shell auth-shell-clean">
    <section className="auth-wrap">
      <div className="auth-brand-row">
        <div className="brand-badge">⛺</div>
        <div><div className="eyebrow">CAMPOREE</div><strong>Club de Conquistadores</strong></div>
      </div>

      <section className="auth-card auth-card-ios">
        <div className="auth-heading">
          <span className="auth-kicker">CREAR CUENTA</span>
          <h1>Empieza a organizar tu próximo camporee.</h1>
          <p className="auth-copy">Crea tu cuenta y entrarás directamente a preparar el camporee. No necesitas confirmar el correo.</p>
        </div>

        {params.error ? <div className="auth-alert error">{params.error}</div> : null}

        <form className="auth-form auth-form-ios">
          <label>Nombre completo
            <div className="field-card"><span>☺</span><input name="fullName" type="text" autoComplete="name" placeholder="Tu nombre" required /></div>
          </label>
          <label>Correo
            <div className="field-card"><span>✉</span><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" required /></div>
          </label>
          <label>Contraseña
            <div className="field-card"><span>●</span><input name="password" type="password" autoComplete="new-password" placeholder="Mínimo 6 caracteres" minLength={6} required /></div>
          </label>
          <button className="primary-btn auth-primary" formAction={signup}>Crear cuenta</button>
        </form>

        <div className="auth-divider"><span>¿Ya tienes cuenta?</span></div>
        <Link className="secondary-btn auth-link-btn" href="/login">Volver a iniciar sesión</Link>
      </section>

      <p className="auth-footnote">Tu cuenta quedará lista para crear uno o varios camporees.</p>
    </section>
  </main>;
}