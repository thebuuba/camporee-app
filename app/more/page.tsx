import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MorePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: membership } = await supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle();
  if (!membership?.is_active) redirect("/login");
  const isAdmin = membership.role === "admin";

  const items = [
    ["🍲","Comidas","Menús, ingredientes y responsables","/more/meals"],
    ["👥","Participantes","Listado general y asistencia","/more/participants"],
    ["☑️","Listas","Qué llevar, compras y materiales","/more/lists"],
    ["💰","Presupuesto","Gastos, compras e ingresos","/more/budget"],
    ["📄","Documentos","Reglamentos, permisos y archivos","/more/documents"],
    ["🩹","Emergencia","Contactos, salud y protocolos","/more/emergency"],
  ] as const;

  return <main className="app more-app">
    <header className="subpage-top"><Link href="/" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">CAMPOREE</div><h1>Más</h1></div><div className="subpage-spacer" /></header>

    <section className="more-grid">
      {items.map(([icon,title,copy,href]) => <Link className="more-card ios-card" href={href} key={title}><span className="more-icon">{icon}</span><div><strong>{title}</strong><small>{copy}</small></div><span className="chevron">›</span></Link>)}
    </section>

    <div className="section-head"><h3>Configuración</h3><span>{isAdmin ? "Administrador" : membership.role === "editor" ? "Editor" : "Solo lectura"}</span></div>
    <section className="settings-list ios-card">
      {isAdmin ? <Link href="/more/users" className="settings-row"><span className="settings-icon red">👤</span><div><strong>Usuarios y permisos</strong><small>Roles, acceso y permisos por módulo</small></div><span className="chevron">›</span></Link> : null}
      <Link href="/more/settings" className="settings-row"><span className="settings-icon green">⚙️</span><div><strong>Ajustes del camporee</strong><small>Datos generales y configuración</small></div><span className="chevron">›</span></Link>
      <form action="/auth/signout" method="post" className="settings-row-form"><button className="settings-row signout-row"><span className="settings-icon gray">↗</span><div><strong>Cerrar sesión</strong><small>Salir de esta cuenta</small></div><span className="chevron">›</span></button></form>
    </section>

    <nav className="nav" aria-label="Navegación principal"><Link href="/"><span>⌂</span>Inicio</Link><button><span>▣</span>Programa</button><button className="plus" aria-label="Agregar">+</button><button><span>✓</span>Tareas</button><Link className="active" href="/more"><span>•••</span>Más</Link></nav>
  </main>;
}
