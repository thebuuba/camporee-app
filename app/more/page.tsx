import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenText, ChevronRight, ClipboardCheck, FileText, HeartPulse, ListChecks, LogOut, Megaphone, Music2, PackageCheck, Settings, ShieldCheck, Soup, Trophy, Users, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ReliableLink from "@/app/components/reliable-link";

const modules = [
  [Music2, "Canciones del club", "Himnos y camporee", "/more/songs", "yellow"],
  [Megaphone, "Avisos", "Mensajes al equipo", "/more/announcements", "peach"],
  [ClipboardCheck, "Pases de lista", "Asistencia y conteos", "/more/attendance", "sage"],
  [Trophy, "Competencias", "Resultados y puntos", "/more/activities", "yellow"],
  [Soup, "Comidas", "Menús e ingredientes", "/more/meals", "pink"],
  [Users, "Participantes", "Unidades y contactos", "/more/participants", "sky"],
  [ListChecks, "Listas", "Compras y equipaje", "/more/lists", "sage"],
  [PackageCheck, "Inventario", "Equipo y materiales", "/more/inventory", "peach"],
  [WalletCards, "Presupuesto", "Ingresos y gastos RD$", "/more/budget", "mint"],
  [FileText, "Documentos", "Permisos, mapas, recibos", "/more/documents", "violet"],
  [HeartPulse, "Emergencia", "Contactos prioritarios", "/more/emergency", "pink"],
  [BookOpenText, "Apuntes", "Notas y observaciones", "/more/notes", "yellow"],
] as const;

export default async function MorePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) redirect("/login");
  const [{ data: membership, error: membershipError }, { data: profile }, { data: camporees }] = await Promise.all([
    supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("full_name,avatar_url").eq("id", userId).maybeSingle(),
    supabase.from("camporees").select("id,name,starts_on,ends_on,status").order("starts_on", { ascending: true }),
  ]);
  if (membershipError || !membership?.is_active) redirect("/");
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];
  const isAdmin = membership.role === "admin";
  const { count: pendingUsers } = isAdmin ? await supabase.from("app_members").select("user_id", { count: "exact", head: true }).eq("is_active", false).or("permissions->>access_rejected.is.null,permissions->>access_rejected.neq.true") : { count: 0 };
  const role = isAdmin ? "Administrador" : membership.role === "editor" ? "Editor" : "Solo lectura";
  const name = profile?.full_name || authData.user?.email || "Mi perfil";
  const dates = camporee ? `${new Date(`${camporee.starts_on}T00:00:00`).toLocaleDateString("es-DO", { day: "numeric", month: "long" })} – ${new Date(`${camporee.ends_on}T00:00:00`).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}` : "Próximamente";
  const state = camporee?.status === "active" ? "En curso" : camporee?.status === "finished" ? "Finalizado" : "Preparación";

  return <main className="app more-app polymet-page">
    <header className="polymet-main-head"><h1>Más</h1><span className="polymet-sync">☁ Sincronizado</span></header>
    <Link href="/profile" className="polymet-user-card ios-card">
      <span className="polymet-user-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : name.slice(0,1).toUpperCase()}</span>
      <span><strong>{name}</strong><small>{role}</small></span><span className="polymet-user-club">Mi perfil ›</span>
    </Link>
    {camporee ? <div className="polymet-event-banner"><img src="/polymet-camp-hero.svg" alt="" /><div><small>{state}</small><strong>{camporee.name}</strong><span>{dates}</span></div></div> : null}
    <section className="more-grid polymet-more-grid">{modules.map(([Icon, title, copy, href, tone]) => <ReliableLink className="more-card ios-card" href={href} key={title}><span className={`more-icon tone-${tone}`}><Icon size={22}/></span><div><strong>{title}</strong><small>{copy}</small></div></ReliableLink>)}</section>
    <div className="polymet-section-label">ADMINISTRACIÓN</div>
    <section className="polymet-more-admin">
      <ReliableLink href="/more/settings" className="more-card ios-card"><span className="more-icon"><Settings size={20}/></span><div><strong>Ajustes</strong><small>Camporee y notificaciones</small></div><ChevronRight size={20} className="polymet-admin-arrow"/></ReliableLink>
      {isAdmin ? <ReliableLink href="/more/users" className="more-card ios-card"><span className="more-icon"><ShieldCheck size={20}/></span><div><strong>Usuarios y permisos</strong><small>Aprobaciones y roles</small></div>{pendingUsers ? <span className="polymet-admin-badge">{pendingUsers}</span> : null}<ChevronRight size={20} className="polymet-admin-arrow"/></ReliableLink> : null}
    </section>
    <form action="/auth/signout" method="post" className="polymet-signout"><button type="submit"><LogOut size={17}/> Cerrar sesión</button></form>
  </main>;
}
