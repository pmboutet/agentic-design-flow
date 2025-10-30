import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export async function getAskSessionByKey<Row>(
  supabase: SupabaseClient,
  rawKey: string,
  columns: string
): Promise<{ row: Row | null; error: PostgrestError | null }> {
  const key = rawKey.trim();

  if (!key) {
    return { row: null, error: null };
  }

  const { data, error } = await supabase
    .from('ask_sessions')
    .select(columns)
    .eq('ask_key', key)
    .maybeSingle<Row>();

  if (error) {
    return { row: null, error };
  }

  return { row: data ?? null, error: null };
}
