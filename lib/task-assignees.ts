import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadTaskAssignees(supabase: SupabaseClient, organizationId: string) {
  return supabase.rpc('organization_task_assignees', { target_organization: organizationId });
}
