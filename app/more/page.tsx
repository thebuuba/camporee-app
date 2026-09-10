import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenText, ClipboardCheck, FileText, HeartPulse, ListChecks, LogOut, Megaphone, PackageCheck, Settings, ShieldCheck, Soup, Trophy, Users, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function MorePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) redirect("/login");
  const { data: membership, error: membershipError } = await supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle();
  if (membershipError) redirect("/");
  if (!membership?.is_active) redirect("/");
  const isAdmin = membership.role === "admin";
  const items = [
    [Megaphone,"Avisos","Cambios, llamados y mensajes importantes","/more/announcements"],
    [ClipboardCheck,"Pases de lista","Salidas, llegadas, cultos y actividades","/more/attendance"],
    [Trophy,"Competencias","Competencias, especialidades y resultados","/more/activities"],
    [Soup,"Comidas","Menús, ingredientes y responsables","/more/meals"],
    [Users,"Participantes","Listado general y unidades","/more/participants"],
    [ListChecks,"Listas","Qué llevar, compras y materiales","/more/lists"],
    [PackageCheck,"Inventario","Qué sale, qué vuelve y cantidades","/more/inventory"],
    [WalletCards,"Presupuesto","Gastos, compras e ingresos","/more/budget"],
    [FileText,"Documentos","Reglamentos, permisos y archivos","/more/documents"],
    [HeartPulse,"Emergencia","Contactos, salud y protocolos","/more/emergency"],
  ] as const;
  return <main className="app more-app"><header className="subpage-top"><Link href="/" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">CAMPOREE</div><h1>Más</h1></div><div className="subpage-spacer" /></header><section className="more-grid">{items.map(([Icon,title,copy,href]) => <Link className="more-card ios-card" href={href} key={title}><span className="more-icon"><Icon size={22}/></span><div><strong>{title}</strong><small>{copy}</small></div><span className="chevron">›</span></Link>)}</section><div className="section-head"><h3>Configuración</h3><span>{isAdmin ? "Administrador" : membership.role === "editor" ? "Editor" : "Solo lectura"}</span></div><section className="settings-list ios-card">{isAdmin ? <Link href="/more/users" className="settings-row"><span className="settings-icon red"><ShieldCheck size={20}/></span><div><strong>Usuarios y permisos</strong><small>Roles, acceso y permisos por módulo</small></div><span className="chevron">›</span></Link> : null}<Link href="/more/settings" className="settings-row"><span className="settings-icon green"><Settings size={20}/></span><div><strong>Ajustes del camporee</strong><small>Datos generales y configuración</small></div><span className="chevron">›</span></Link><Link href="/more/notes" className="settings-row"><span className="settings-icon gray"><BookOpenText size={20}/></span><div><strong>Apuntes</strong><small>Notas rápidas y observaciones</small></div><span className="chevron">›</span></Link><form action="/auth/signout" method="post" className="settings-row signout-row"><span className="settings-icon gray"><LogOut size={20}/></span><div><strong>Cerrar sesión</strong><small>Salir de esta cuenta en este dispositivo</small></div><button type="submit" aria-label="Cerrar sesión">Salir</button></form></section></main>;
}
