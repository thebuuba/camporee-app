import type { SupabaseClient, User } from '@supabase/supabase-js';

export type TenantIds = { organizationId: string; camporeeId: string };
export type OrganizationMembership = {
  organization_id: string; user_id: string; role: 'admin' | 'editor' | 'viewer';
  is_active: boolean; permissions: Record<string, boolean>; directive_role: string | null; created_at: string;
};
export type Camporee = {
  id: string; organization_id: string; owner_id: string | null; name: string;
  theme: string | null; location: string | null; starts_on: string; ends_on: string;
  status: 'planning' | 'active' | 'finished' | 'archived'; currency: string; time_zone: string;
};
export type CamporeeContext = TenantIds & {
  supabase: SupabaseClient; user: User; userId: string;
  organization: { id: string; name: string; owner_user_id: string | null };
  membership: OrganizationMembership; camporee: Camporee; isAdmin: boolean;
  canEdit: (module: string) => boolean;
};
export type OrganizationContext = Omit<CamporeeContext, 'camporeeId' | 'camporee' | 'canEdit'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isTenantId = (value:string) => UUID.test(value);
export class TenantAccessError extends Error {
  reason: 'authentication' | 'access' | 'invalid';
  constructor(reason: TenantAccessError['reason']) {
    super(reason === 'invalid' ? 'Invalid tenant context' : reason === 'authentication' ? 'Authentication required' : 'Tenant access unavailable');
    this.reason = reason;
  }
}

// No session preferences or global role fallback participate in authorization.
// Every query is also protected by Supabase RLS using the caller's session.
async function authenticatedUser(supabase: SupabaseClient) {
  const auth = await supabase.auth.getUser();
  if (auth.error) {
    if(auth.error.name==='AuthSessionMissingError'||auth.error.status===401||auth.error.status===403)throw new TenantAccessError('authentication');
    throw auth.error;
  }
  if (!auth.data.user) throw new TenantAccessError('authentication');
  return auth.data.user;
}
async function organizationScope(supabase: SupabaseClient, organizationId: string, user: User): Promise<OrganizationContext> {
  const [organizationResult, membershipResult] = await Promise.all([
    supabase.from('organizations').select('id,name,owner_user_id').eq('id', organizationId).maybeSingle(),
    supabase.from('organization_members').select('organization_id,user_id,role,is_active,permissions,directive_role,created_at').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle(),
  ]);
  const error = organizationResult.error ?? membershipResult.error;
  if (error) {
    const failure = new Error(error.message) as Error & {code?: string};
    failure.code = error.code;
    throw failure;
  }
  if (!organizationResult.data || !membershipResult.data?.is_active) throw new TenantAccessError('access');
  const membership = membershipResult.data as OrganizationMembership;
  return {organizationId,supabase,user,userId:user.id,organization:organizationResult.data,membership,isAdmin:membership.role==='admin'};
}
export async function resolveOrganizationContext(supabase: SupabaseClient, organizationId: string): Promise<OrganizationContext> {
  if (!UUID.test(organizationId)) throw new TenantAccessError('invalid');
  return organizationScope(supabase, organizationId, await authenticatedUser(supabase));
}
export async function resolveCamporeeContext(supabase: SupabaseClient, ids: TenantIds): Promise<CamporeeContext> {
  if (!UUID.test(ids.organizationId) || !UUID.test(ids.camporeeId)) throw new TenantAccessError('invalid');
  const user = await authenticatedUser(supabase);
  const [scope,camporeeResult] = await Promise.all([
    organizationScope(supabase,ids.organizationId,user),
    supabase.from('camporees').select('id,organization_id,owner_id,name,theme,location,starts_on,ends_on,status,currency,time_zone').eq('organization_id', ids.organizationId).eq('id', ids.camporeeId).maybeSingle(),
  ]);
  if (camporeeResult.error) {
    const failure = new Error(camporeeResult.error.message) as Error & {code?: string};
    failure.code = camporeeResult.error.code;
    throw failure;
  }
  if (!camporeeResult.data) throw new TenantAccessError('access');
  const membership = scope.membership;
  const camporee = camporeeResult.data as Camporee;
  return {
    ...scope, camporeeId:ids.camporeeId, camporee,
    canEdit: module => camporee.status !== 'archived' && (membership.role === 'admin' || membership.role === 'editor' || membership.permissions?.[module] === true || membership.permissions?.edit === true),
  };
}

export function parseTenantPath(pathname: string): (TenantIds & { panel: string }) | null {
  const match = /^\/o\/([^/]+)\/c\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) return null;
  return { organizationId: match[1], camporeeId: match[2], panel: match[3] || '/' };
}

export function tenantPath(ids: TenantIds, target = '/') {
  if (!UUID.test(ids.organizationId) || !UUID.test(ids.camporeeId)) throw new TenantAccessError('invalid');
  if (!target.startsWith('/') || /^\/(auth|login|profile|organizations|o)(\/|\?|$)/.test(target)) return target;
  const prefix = `/o/${ids.organizationId}/c/${ids.camporeeId}`;
  return `${prefix}${target === '/' ? '' : target}`;
}

export function safeAuthReturn(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const url = new URL(value, 'https://camporee.invalid');
    if (url.origin !== 'https://camporee.invalid') return '/';
    const path = url.pathname;
    const orgRoute = /^\/o\/([^/]+)$/.exec(path);
    const allowed = path === '/' || /^\/(organizations|profile|tasks|program|search|more)(\/[^/]+)?$/.test(path)
      || /^\/invitations\/[a-f0-9]{64}$/.test(path) || /^\/join\/[a-f0-9]{16}$/i.test(path) || Boolean(parseTenantPath(path)) || Boolean(orgRoute && UUID.test(orgRoute[1]));
    return allowed ? `${path}${url.search}` : '/';
  } catch { return '/'; }
}
