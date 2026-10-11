import Link from '@/app/components/tenant-link';
import { BookOpenText, ChevronRight, ClipboardCheck, FileText, HeartPulse, ListChecks, LogOut, Megaphone, Music2, PackageCheck, Settings, ShieldCheck, Soup, Trophy, Users, WalletCards } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import ReliableLink from "@/app/components/reliable-link";
import {signedAvatar} from '@/lib/avatars';

const modules = [
  [Music2, "Canciones del club", "Himnos y camporee", "/more/songs", "yellow"],
  [Megaphone, "Avisos", "Mensajes al equipo", "/more/announcements", "peach"],
  [ClipboardCheck, "Pases de lista", "Asistencia y conteos", "/more/attendance", "sage"],
  [Trophy, "Competencias", "Resultados y puntos", "/more/activities", "yellow"],
  [Soup, "Comidas", "Menús e ingredientes", "/more/meals", "pink"],
  [Users, "Participantes", "Unidades y contactos", "/more/participants", "sky"],
  [ListChecks, "Listas", "Compras y equipaje", "/more/lists", "sage"],
  [PackageCheck, "Inventario", "Equipo y materiales", "/more/inventory", "peach"],
  [WalletCards, "Presupuesto", "Ingresos y gastos", "/more/budget", "mint"],
  [FileText, "Documentos", "Permisos, mapas, recibos", "/more/documents", "violet"],
  [HeartPulse, "Emergencia", "Contactos prioritarios", "/more/emergency", "pink"],
  [BookOpenText, "Apuntes", "Notas y observaciones", "/more/notes", "yellow"],
] as const;

export default async function MorePage({params}:{params?:TenantPageParams}={}) {
  const context = await requireCamporeeContext(params, '/more');
  const {supabase,userId,camporee,membership,user}=context;
  const {data:profile,error:profileError}=await supabase.from('profiles').select('full_name,avatar_url,avatar_path').eq('id',userId).maybeSingle();
  if(profileError)throw profileError;
  const avatarUrl=await signedAvatar(supabase,{...profile,id:userId});
  const isAdmin = context.isAdmin;
  const { count: pendingUsers, error:pendingError } = isAdmin ? await supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq('organization_id',context.organizationId).eq("is_active", false).or("permissions->>access_rejected.is.null,permissions->>access_rejected.neq.true") : { count: 0, error:null };
  if(pendingError)throw pendingError;
  const role = isAdmin ? "Administrador" : membership.role === "editor" ? "Editor" : "Solo lectura";
  const name = profile?.full_name || user.email || "Mi perfil";
  const dates = camporee ? `${new Date(`${camporee.starts_on}T00:00:00`).toLocaleDateString("es-DO", { day: "numeric", month: "long" })} – ${new Date(`${camporee.ends_on}T00:00:00`).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}` : "Próximamente";
  const state = camporee?.status === 'archived' ? 'Archivado' : camporee?.status === "active" ? "En curso" : camporee?.status === "finished" ? "Finalizado" : "Preparación";

  return <main className="app more-app polymet-page">
    <header className="polymet-main-head"><h1>Más</h1><span className="polymet-sync">☁ Sincronizado</span></header>
    <Link href="/profile" className="polymet-user-card ios-card">
      <span className="polymet-user-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : name.slice(0,1).toUpperCase()}</span>
      <span><strong>{name}</strong><small>{role}</small></span><span className="polymet-user-club">Mi perfil ›</span>
    </Link>
    {camporee ? <div className="polymet-event-banner"><img src="/polymet-camp-hero.svg" alt="" /><div><small>{state}</small><strong>{camporee.name}</strong><span>{dates}</span></div></div> : null}
    <section className="more-grid polymet-more-grid">{modules.map(([Icon, title, copy, href, tone]) => <ReliableLink className="more-card ios-card" href={href} key={title}><span className={`more-icon tone-${tone}`}><Icon size={22}/></span><div><strong>{title}</strong><small>{copy}</small></div></ReliableLink>)}</section>
    <div className="polymet-section-label">ADMINISTRACIÓN</div>
    <section className="polymet-more-admin">
      <ReliableLink href="/more/settings" className="more-card ios-card"><span className="more-icon"><Settings size={20}/></span><div><strong>Ajustes</strong><small>Camporee y notificaciones</small></div><ChevronRight size={20} className="polymet-admin-arrow"/></ReliableLink>
      {isAdmin ? <ReliableLink href={`/o/${context.organizationId}/members`} className="more-card ios-card"><span className="more-icon"><ShieldCheck size={20}/></span><div><strong>Usuarios y permisos</strong><small>Miembros de esta organización</small></div>{pendingUsers ? <span className="polymet-admin-badge">{pendingUsers}</span> : null}<ChevronRight size={20} className="polymet-admin-arrow"/></ReliableLink> : null}
    </section>
    <form action="/auth/signout" method="post" className="polymet-signout"><button type="submit"><LogOut size={17}/> Cerrar sesión</button></form>
  </main>;
}
