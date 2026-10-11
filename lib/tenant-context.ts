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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class TenantAccessError extends Error {
  reason: 'authentication' | 'access' | 'invalid';
  constructor(reason: TenantAccessError['reason']) {
    super(reason === 'invalid' ? 'Invalid tenant context' : reason === 'authentication' ? 'Authentication required' : 'Tenant access unavailable');
    this.reason = reason;
  }
}

// No session preferences or global role fallback participate in authorization.
// Every query is also protected by Supabase RLS using the caller's session.
export async function resolveCamporeeContext(supabase: SupabaseClient, ids: TenantIds): Promise<CamporeeContext> {
  if (!UUID.test(ids.organizationId) || !UUID.test(ids.camporeeId)) throw new TenantAccessError('invalid');
  const auth = await supabase.auth.getUser();
  if (auth.error) throw auth.error;
  if (!auth.data.user) throw new TenantAccessError('authentication');
  const user = auth.data.user;
  const [organizationResult, membershipResult, camporeeResult] = await Promise.all([
    supabase.from('organizations').select('id,name,owner_user_id').eq('id', ids.organizationId).maybeSingle(),
    supabase.from('organization_members').select('organization_id,user_id,role,is_active,permissions,directive_role,created_at').eq('organization_id', ids.organizationId).eq('user_id', user.id).maybeSingle(),
    supabase.from('camporees').select('id,organization_id,owner_id,name,theme,location,starts_on,ends_on,status,currency,time_zone').eq('organization_id', ids.organizationId).eq('id', ids.camporeeId).maybeSingle(),
  ]);
  const error = organizationResult.error ?? membershipResult.error ?? camporeeResult.error;
  if (error) throw new Error(error.message);
  if (!organizationResult.data || !membershipResult.data?.is_active || !camporeeResult.data) throw new TenantAccessError('access');
  const membership = membershipResult.data as OrganizationMembership;
  const camporee = camporeeResult.data as Camporee;
  return {
    ...ids, supabase, user, userId: user.id, organization: organizationResult.data, membership, camporee,
    isAdmin: membership.role === 'admin',
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
