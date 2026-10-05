import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadTaskAssignees(supabase: SupabaseClient) {
  const result = await supabase.rpc('active_task_assignees');
  if (result.error?.code !== 'PGRST202') return result;

  // Compatibility while the directive-role migration is pending. These
  // queries keep the existing row-level security and active-user filter.
  const members = await supabase.from('app_members').select('user_id').eq('is_active', true);
  if (members.error) return { data: null, error: members.error };
  const ids = (members.data ?? []).map((member) => member.user_id);
  if (!ids.length) return { data: [], error: null };
  return supabase.from('profiles').select('id,full_name,email').in('id', ids).order('full_name', { ascending: true });
}
