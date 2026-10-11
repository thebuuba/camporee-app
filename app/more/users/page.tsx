import Link from '@/app/components/tenant-link';
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireOrganizationContext, redirectLegacyPanel } from '@/lib/tenant-server';
import UsersManager, { PermissionFields, DirectiveRoleField } from "./users-manager";
import OrganizationForm from '@/app/organizations/organization-form';
import MemberActionForm from './member-action-form';
import {signedAvatar} from '@/lib/avatars';

export default async function UsersPage({ params, searchParams }: { params?:Promise<{organizationId?:string}>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const organizationId=(await params)?.organizationId;
  if(!organizationId)return redirectLegacyPanel('/more/users',searchParams);
  const context=await requireOrganizationContext(organizationId);
  if(!context.isAdmin)notFound();
  const query=await searchParams;
  const {supabase,userId,organization}=context;
  const [{data:members,error:membersError},{data:invitations,error:invitationsError}]=await Promise.all([
    supabase.from('organization_members').select('*').eq('organization_id',organizationId).order('created_at',{ascending:false}),
    supabase.from('organization_invitations').select('id,email,role,expires_at,accepted_at,revoked_at').eq('organization_id',organizationId).order('created_at',{ascending:false}),
  ]);
  if(membersError||invitationsError)throw membersError??invitationsError;
  const ids=(members??[]).map(member=>member.user_id);
  const {data:profiles,error:profilesError}=ids.length?await supabase.from('profiles').select('id,full_name,email,avatar_path').in('id',ids):{data:[],error:null};
  if(profilesError)throw profilesError;

  const profileMap = new Map(await Promise.all((profiles ?? []).map(async profile=>[profile.id,{...profile,avatar_url:await signedAvatar(supabase,profile)}] as const)));
  const users = (members ?? []).filter(member => member.permissions?.access_rejected !== true).map((member) => {
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
    <header className="subpage-top"><Link href={`/o/${organizationId}`} className="back-btn" aria-label="Volver a la organización"><ChevronLeft size={20}/></Link><div><h1>Miembros y permisos</h1><p className="polymet-subtitle">{organization.name} · {users.filter((user) => user.is_active).length} activos · {users.filter((user) => !user.is_active).length} por aprobar</p></div></header>
    {query.error ? <div className="auth-alert error">{query.error}</div> : null}{query.saved ? <div className="auth-alert success">Permisos actualizados.</div> : null}
    <UsersManager key={`${userId}:${organizationId}`} organizationId={organizationId} ownerUserId={organization.owner_user_id} users={users} directiveRolesAvailable/>
    <details className="organization-create"><summary>Invitar a una persona</summary><OrganizationForm kind="invite" submitLabel="Crear invitación">
      <input type="hidden" name="organizationId" value={organizationId}/>
      <label>Correo<input name="email" type="email" required autoComplete="email"/></label>
      <label>Rol<select name="role" defaultValue="viewer"><option value="viewer">Solo lectura</option><option value="editor">Editor</option><option value="admin">Administrador</option></select></label>
      <PermissionFields permissions={{}}/><DirectiveRoleField value={null}/>
    </OrganizationForm></details>
    <section className="organization-list"><h2>Invitaciones</h2>{(invitations??[]).map(invitation=><article key={invitation.id} className="ios-card"><strong>{invitation.email}</strong><p>{invitation.accepted_at?'Aceptada':invitation.revoked_at?'Revocada':new Date(invitation.expires_at).getTime()<Date.now()?'Vencida':'Pendiente'}</p>{!invitation.accepted_at&&!invitation.revoked_at?<MemberActionForm kind="revoke" label="Revocar invitación"><input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="invitationId" value={invitation.id}/></MemberActionForm>:null}</article>)}</section>
    {organization.owner_user_id===userId?<details className="organization-create"><summary>Transferir la propiedad</summary><p>Elige otro administrador activo. Tu acceso se conserva; después el nuevo propietario podrá administrarlo.</p><MemberActionForm kind="transfer" label="Transferir propiedad"><input type="hidden" name="organizationId" value={organizationId}/><label>Nuevo propietario<select name="newOwner" required defaultValue=""><option value="" disabled>Selecciona un administrador</option>{users.filter(user=>user.is_active&&user.role==='admin'&&!user.is_self).map(user=><option key={user.user_id} value={user.user_id}>{user.full_name||user.email}</option>)}</select></label></MemberActionForm></details>:null}
  </main>;
}
