// Database changes must be deployed together with the multi-tenant frontend.
// Only identify *specific* missing tenant tables/columns, not transient network
// errors or permission denials. Never infer that a migration has been applied.
export function isTenantSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  if (!['42P01','42703','PGRST205','PGRST204'].includes(code)) return false;
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return /\b(organizations|organization_members|organization_invitations|organization_id|owner_user_id|camporee_ids|time_zone|currency)\b/i.test(message);
}
