import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveCamporeeContext, TenantAccessError, tenantPath, type TenantIds } from '@/lib/tenant-context';

export type TenantPageParams = Promise<TenantIds>;
export type PanelSearchParams = Promise<Record<string, string | string[] | undefined>>;
const loadContext = cache(async (organizationId: string, camporeeId: string) =>
  resolveCamporeeContext(await createClient(), { organizationId, camporeeId }));

export async function redirectLegacyPanel(panel = '/', query?: PanelSearchParams): Promise<never> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error && (auth.error.status ?? 0) >= 500) throw auth.error;
  if (!auth.data.user) redirect('/login');
  const result = await supabase.from('camporees').select('id,organization_id,status,starts_on').order('starts_on', { ascending: true });
  if (result.error) throw new Error('No se pudo cargar el contexto de organizaciones. Verifica que se haya aplicado la migración multi-tenant.');
  const camporees = result.data ?? [];
  const organizations = new Set(camporees.map(camporee => camporee.organization_id));
  // Old links are unambiguous only for accounts with one accessible organization.
  if (organizations.size !== 1 || !camporees.length) redirect('/organizations');
  const camporee = camporees.find(item => item.status !== 'archived') ?? camporees[0];
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ? await query : {})) {
    if (Array.isArray(value)) value.forEach(item => search.append(key, item));
    else if (value !== undefined) search.set(key, value);
  }
  const href = tenantPath({ organizationId: camporee.organization_id, camporeeId: camporee.id }, panel);
  redirect(`${href}${search.size ? `?${search}` : ''}`);
}

export async function requireCamporeeContext(params?: TenantPageParams, legacyPanel = '/', query?: PanelSearchParams) {
  const ids = params ? await params : null;
  if (!ids?.organizationId || !ids?.camporeeId) return redirectLegacyPanel(legacyPanel, query);
  try { return await loadContext(ids.organizationId, ids.camporeeId); }
  catch (error) {
    if (error instanceof TenantAccessError) {
      if (error.reason === 'authentication') redirect('/login');
      notFound();
    }
    throw error;
  }
}
