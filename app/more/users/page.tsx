import Link from '@/app/components/tenant-link';
import {headers} from 'next/headers';
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireOrganizationContext, redirectLegacyPanel } from '@/lib/tenant-server';
import UsersManager from "./users-manager";
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
  const [{data:members,error:membersError},{data:camporee,error:camporeeError}]=await Promise.all([
    supabase.from('organization_members').select('*').eq('organization_id',organizationId).order('created_at',{ascending:false}),
    supabase.from('camporees').select('id,name').eq('organization_id',organizationId).neq('status','archived').maybeSingle(),
  ]);
  if(membersError||camporeeError)throw membersError??camporeeError;
  const {data:joinCode,error:joinCodeError}=camporee
    ?await supabase.rpc('read_camporee_join_code',{target_camporee:camporee.id})
    :{data:null,error:null};
  if(joinCodeError)throw joinCodeError;
  const requestHeaders=await headers();
  const host=requestHeaders.get('x-forwarded-host')||requestHeaders.get('host');
  const protocol=requestHeaders.get('x-forwarded-proto')||(host?.startsWith('localhost')?'http':'https');
  const localHost=Boolean(host&&/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host));
  const siteUrl=((localHost?`${protocol}://${host}`:process.env.NEXT_PUBLIC_SITE_URL) || (host?`${protocol}://${host}`:'')).replace(/\/$/,'');
  const shareUrl=joinCode?`${siteUrl}/join/${joinCode}`:'';
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
    <header className="subpage-top"><Link href="/" className="back-btn" aria-label="Volver al camporee"><ChevronLeft size={20}/></Link><div><h1>Miembros y permisos</h1><p className="polymet-subtitle">{organization.name} · {users.filter((user) => user.is_active).length} activos · {users.filter((user) => !user.is_active).length} por aprobar</p></div></header>
    {query.error ? <div className="auth-alert error">{query.error}</div> : null}{query.saved ? <div className="auth-alert success">Permisos actualizados.</div> : null}
    <UsersManager key={`${userId}:${organizationId}`} organizationId={organizationId} ownerUserId={organization.owner_user_id} users={users} directiveRolesAvailable/>
    {camporee?<section className="organization-section ios-card">
      <h2>Invitar a mi camporee</h2>
      <p>Comparte un solo código o enlace con los miembros de tu club. Cada persona se registra una vez y entra directamente, sin elegir camporee.</p>
      {joinCode?<div className="organization-invite-result">
        <label>Código del camporee<input readOnly value={joinCode}/></label>
        <label>Enlace de invitación<input readOnly value={shareUrl}/></label>
        <p>Este enlace es reutilizable. Cualquier persona con él y una cuenta verificada puede unirse al club.</p>
      </div>:<OrganizationForm kind="create-join-code" submitLabel="Generar código y enlace">
        <input type="hidden" name="camporeeId" value={camporee.id}/>
      </OrganizationForm>}
    </section>:<p className="empty compact">Crea primero tu camporee para poder invitar al equipo.</p>}
    {organization.owner_user_id===userId?<details className="organization-create"><summary>Transferir la propiedad</summary><p>Elige otro administrador activo. Tu acceso se conserva; después el nuevo propietario podrá administrarlo.</p><MemberActionForm kind="transfer" label="Transferir propiedad"><input type="hidden" name="organizationId" value={organizationId}/><label>Nuevo propietario<select name="newOwner" required defaultValue=""><option value="" disabled>Selecciona un administrador</option>{users.filter(user=>user.is_active&&user.role==='admin'&&!user.is_self).map(user=><option key={user.user_id} value={user.user_id}>{user.full_name||user.email}</option>)}</select></label></MemberActionForm></details>:null}
  </main>;
}
