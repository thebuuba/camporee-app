import { login, signup } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return <main className="auth-shell">
    <section className="auth-card">
      <div className="brand-badge">⛺</div>
      <div className="eyebrow">CAMPOREE</div>
      <h1>Organiza todo sin perderte en el camino.</h1>
      <p className="auth-copy">Tareas, programa, participantes, compras, comidas y gastos en un solo lugar.</p>
      {params.error ? <div className="auth-alert error">{params.error}</div> : null}
      {params.message ? <div className="auth-alert success">{params.message}</div> : null}
      <form className="auth-form">
        <label>Nombre completo<input name="fullName" type="text" placeholder="Tu nombre" /></label>
        <label>Correo<input name="email" type="email" inputMode="email" autoComplete="email" placeholder="correo@ejemplo.com" required /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" placeholder="Mínimo 6 caracteres" minLength={6} required /></label>
        <button className="primary-btn" formAction={login}>Entrar</button>
        <button className="secondary-btn" formAction={signup}>Crear cuenta</button>
      </form>
      <div className="auth-colors"><i/><i/><i/><i/></div>
    </section>
  </main>;
}