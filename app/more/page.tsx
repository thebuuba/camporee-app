import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenText, FileText, HeartPulse, ListChecks, Settings, ShieldCheck, Soup, Users, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "../components/bottom-nav";

export default async function MorePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: membership } = await supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle();
  if (!membership?.is_active) redirect("/login");
  const isAdmin = membership.role === "admin";
  const items = [
    [Soup,"Comidas","Menús, ingredientes y responsables","/more/meals"],
    [Users,"Participantes","Listado general y asistencia","/more/participants"],
    [ListChecks,"Listas","Qué llevar, compras y materiales","/more/lists"],
    [WalletCards,"Presupuesto","Gastos, compras e ingresos","/more/budget"],
    [FileText,"Documentos","Reglamentos, permisos y archivos","/more/documents"],
    [HeartPulse,"Emergencia","Contactos, salud y protocolos","/more/emergency"],
  ] as const;
  return <main className="app more-app"><header className="subpage-top"><Link href="/" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">CAMPOREE</div><h1>Más</h1></div><div className="subpage-spacer" /></header><section className="more-grid">{items.map(([Icon,title,copy,href]) => <Link className="more-card ios-card" href={href} key={title}><span className="more-icon"><Icon size={22}/></span><div><strong>{title}</strong><small>{copy}</small></div><span className="chevron">›</span></Link>)}</section><div className="section-head"><h3>Configuración</h3><span>{isAdmin ? "Administrador" : membership.role === "editor" ? "Editor" : "Solo lectura"}</span></div><section className="settings-list ios-card">{isAdmin ? <Link href="/more/users" className="settings-row"><span className="settings-icon red"><ShieldCheck size={20}/></span><div><strong>Usuarios y permisos</strong><small>Roles, acceso y permisos por módulo</small></div><span className="chevron">›</span></Link> : null}<Link href="/more/settings" className="settings-row"><span className="settings-icon green"><Settings size={20}/></span><div><strong>Ajustes del camporee</strong><small>Datos generales y configuración</small></div><span className="chevron">›</span></Link><Link href="/more/notes" className="settings-row"><span className="settings-icon gray"><BookOpenText size={20}/></span><div><strong>Apuntes</strong><small>Notas rápidas y observaciones</small></div><span className="chevron">›</span></Link></section><BottomNav /></main>;
}
