import { LogOut, TentTree } from "lucide-react";
import SetupForm from "./setup-form";

export default function HomeSetup({ firstName, isAdmin, role }: { firstName: string; isAdmin: boolean; role?: string }) {
  return <main className="app setup-app">
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><form action="/auth/signout" method="post"><button className="icon-btn" aria-label="Cerrar sesión"><LogOut size={19}/></button></form></header>
    {!isAdmin ? <section className="setup-intro ios-card waiting-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">ACCESO LISTO</span><h2>Ya eres parte del equipo.</h2></div><p>Todos trabajan sobre el mismo camporee. Cuando un administrador cree el evento, aparecerá aquí automáticamente para ti.</p><div className="auth-alert success">Acceso activo como {role === "editor" ? "editor" : "solo lectura"}.</div></section> : <><section className="setup-intro ios-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">EMPECEMOS</span><h2>Prepara la próxima aventura.</h2><p>Crea el evento compartido y después todo el equipo podrá organizar tareas, programa, participantes, comidas, listas y presupuesto desde el mismo lugar.</p></div><div className="setup-steps"><span className="active">1</span><i/><span>2</span><i/><span>3</span></div><div className="setup-step-labels"><span>Evento</span><span>Equipo</span><span>Listo</span></div></section><section className="setup-card ios-card"><div className="section-head inside"><div><div className="eyebrow">PASO 1 DE 3</div><h3>Datos del camporee</h3></div><span>Podrás editarlos luego</span></div><SetupForm /></section></>}
  </main>;
}
