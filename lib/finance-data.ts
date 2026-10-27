import type { SupabaseClient } from '@supabase/supabase-js';

// One scalar JSON aggregate uses one database snapshot and avoids REST row caps.
// The UI already renders the entire list: payload size grows with its history.
// If that becomes too large, use a server-persisted snapshot or an export flow.
export async function loadFinanceRows(supabase: SupabaseClient, camporeeId: string, table: 'expenses' | 'income_entries') {
  const { data, error } = await supabase.rpc('get_camporee_finance_rows', { target_camporee: camporeeId, entry_kind: table });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('No se pudo cargar la lista completa de finanzas.');
  return { data, error: null };
}
