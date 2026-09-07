import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { updateMemberAccess } from "./actions";

const permissionLabels = [
  ["tasks","Tareas"],["schedule","Programa"],["participants","Participantes"],["finances","Finanzas"],["meals","Comidas"],["notes","Apuntes"],["lists","Listas"],["inventory","Inventario"],["settings","Ajustes"],
] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: me } = await supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle();
  if (!me?.is_active || me.role !== "admin") redirect("/more");
  const [{ data: members }, { data: profiles }] = await Promise.all([
    supabase.from("app_members").select("user_id,role,permissions,is_active,created_at").order("created_at", { ascending: true }),
    supabase.from("profiles").select("id,full_name,email"),
  ]);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return <main className="app users-app">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">ADMINISTRACIÓN</div><h1>Usuarios y permisos</h1></div><span className="avatar"><ShieldCheck size={21}/></span></header>
    <section className="permission-intro ios-card"><span className="settings-icon red"><UsersRound size={21}/></span><div><strong>Un solo equipo, un solo camporee</strong><p>Controla quién administra, quién edita y quién solo consulta. Estos permisos se aplican también en la base de datos.</p></div></section>
    {params.error ? <div className="auth-alert error">{params.error}</div> : null}{params.saved ? <div className="auth-alert success">Permisos actualizados.</div> : null}
    <div className="section-head"><h3>Personas</h3><span>{members?.length ?? 0} cuentas</span></div>
    <section className="member-list">{(members ?? []).map((member) => {
      const profile = profileMap.get(member.user_id); const permissions = (member.permissions ?? {}) as Record<string, boolean>; const isSelf = member.user_id === userId;
      return <form action={updateMemberAccess} className="member-card ios-card" key={member.user_id}>
        <input type="hidden" name="userId" value={member.user_id} />
        <div className="member-head"><div className="member-avatar">{(profile?.full_name || profile?.email || "U").slice(0,1).toUpperCase()}</div><div className="member-copy"><strong>{profile?.full_name || "Sin nombre"}{isSelf ? " · Tú" : ""}</strong><small>{profile?.email || "Correo no disponible"}</small></div><label className="switch"><input type="checkbox" name="isActive" defaultChecked={member.is_active} disabled={isSelf}/><span /></label>{isSelf ? <input type="hidden" name="isActive" value="on" /> : null}</div>
        <label className="role-field">Rol<select name="role" defaultValue={member.role} disabled={isSelf}><option value="admin">Administrador</option><option value="editor">Editor</option><option value="viewer">Solo lectura</option></select>{isSelf ? <input type="hidden" name="role" value="admin" /> : null}</label>
        <div className="permission-title"><strong>Permisos específicos</strong><small>Permite editar módulos concretos aunque la cuenta sea de solo lectura.</small></div>
        <div className="permission-grid">{permissionLabels.map(([key,label]) => <label className="permission-chip" key={key}><input type="checkbox" name={key} defaultChecked={Boolean(permissions[key])}/><span>{label}</span></label>)}</div>
        <button className="primary-btn member-save" type="submit">Guardar permisos</button>
      </form>;
    })}</section>
  </main>;
}
