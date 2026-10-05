import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import UsersManager from "./users-manager";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: me, error: meError } = await supabase.from("app_members").select("role,is_active").eq("user_id", userId).maybeSingle();
  if (meError) throw meError;
  if (!me?.is_active || me.role !== "admin") redirect("/more");

  const [{ data: members, error: membersError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("app_members").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id,full_name,email,avatar_url"),
  ]);
  if (membersError || profilesError) throw membersError ?? profilesError;

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const users = (members ?? []).map((member) => {
    const profile = profileMap.get(member.user_id);
    return {
      user_id:member.user_id,
      role:member.role,
      directive_role:member.directive_role ?? null,
      permissions:(member.permissions ?? {}) as Record<string,boolean>,
      is_active:member.is_active,
      created_at:member.created_at,
      full_name:profile?.full_name ?? null,
      email:profile?.email ?? null,
      avatar_url:profile?.avatar_url ?? null,
      is_self:member.user_id === userId,
    };
  });

  return <main className="app users-app">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver"><ChevronLeft size={20}/></Link><div><h1>Usuarios y permisos</h1><p className="polymet-subtitle">{users.filter((user) => user.is_active).length} activos · {users.filter((user) => !user.is_active).length} por aprobar</p></div></header>
    {params.error ? <div className="auth-alert error">{params.error}</div> : null}{params.saved ? <div className="auth-alert success">Permisos actualizados.</div> : null}
    <UsersManager users={users} directiveRolesAvailable={(members ?? []).some((member) => Object.hasOwn(member, 'directive_role'))}/>
  </main>;
}
