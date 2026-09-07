import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;

  return <main className="auth-shell auth-shell-clean">
    <section className="auth-wrap">
      <div className="auth-brand-row">
        <div className="brand-badge">⛺</div>
        <div><div className="eyebrow">CAMPOREE</div><strong>Club de Conquistadores</strong></div>
      </div>

      <section className="auth-card auth-card-ios">
        <div className="auth-heading">
          <span className="auth-kicker">BIENVENIDO</span>
          <h1>Tu camporee, bien organizado desde el inicio.</h1>
          <p className="auth-copy">Entra para continuar con tareas, programa, participantes, comidas, compras y presupuesto.</p>
        </div>

        {params.error ? <div className="auth-alert error">{params.error}</div> : null}
        {params.message ? <div className="auth-alert success">{params.message}</div> : null}

        <form className="auth-form auth-form-ios">
          <label>Correo
            <div className="field-card"><span>✉</span><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" required /></div>
          </label>
          <label>Contraseña
            <div className="field-card"><span>●</span><input name="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" minLength={6} required /></div>
          </label>
          <button className="primary-btn auth-primary" formAction={login}>Entrar</button>
        </form>

        <div className="auth-divider"><span>¿Primera vez?</span></div>
        <Link className="secondary-btn auth-link-btn" href="/signup">Crear una cuenta</Link>
      </section>

      <p className="auth-footnote">Hecho para organizar el camporee con rapidez, incluso desde el teléfono.</p>
    </section>
  </main>;
}