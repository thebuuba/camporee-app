import Link from "next/link";
import { Mail } from "lucide-react";
import { login, requestPasswordReset, updatePassword } from "./actions";
import PasswordField from "./password-field";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; reset?: string }> }) {
  const params = await searchParams;
  const resetting = params.reset === "1";
  return <main className="pm-login-shell">
    <header className="pm-login-header">
      <img src="/polymet-camp-preparation.svg" alt="" aria-hidden="true" />
      <div className="pm-login-heading">
        <span className="pm-login-mark"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg></span>
        <h1>{resetting ? "Nueva contraseña" : "¡Bienvenido!"}</h1>
        <p>{resetting ? "Elige una clave para volver a entrar." : "Inicia sesión para seguir organizando."}</p>
      </div>
    </header>
    <section className="pm-login-content" aria-label={resetting ? "Cambiar contraseña" : "Iniciar sesión"}>
      {params.error ? <div className="auth-alert error" role="alert">{params.error}</div> : null}
      {params.message ? <div className="auth-alert success" role="status">{params.message}</div> : null}
      <form className="pm-login-form" action={resetting ? updatePassword : login}>
        {!resetting ? <label className="pm-login-field">Correo electrónico<div className="pm-login-input"><Mail size={16} aria-hidden="true" /><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" required /></div></label> : null}
        <PasswordField resetting={resetting} />
        {!resetting ? <div className="pm-login-options"><label><input name="remember" type="checkbox" defaultChecked />Recordarme</label><button type="submit" formAction={requestPasswordReset} formNoValidate>¿Olvidaste tu clave?</button></div> : null}
        <button className="pm-login-submit">{resetting ? "Guardar contraseña" : "Iniciar sesión"}</button>
      </form>
      <p className="pm-login-register">{resetting ? <Link href="/login">Volver al inicio de sesión</Link> : <>¿No tienes cuenta? <Link href="/signup">Crear cuenta</Link></>}</p>
      <aside className="pm-login-notice">Las cuentas nuevas deben ser aprobadas por un administrador del club antes de poder entrar.</aside>
    </section>
  </main>;
}
